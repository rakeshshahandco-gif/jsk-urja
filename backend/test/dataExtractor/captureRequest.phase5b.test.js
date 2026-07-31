/**
 * Checkpoint 5B — capture request request/ack/idempotency (crm_test).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { SearchQuery } from '../../src/models/searchQuery.model.js';
import { AssistedCaptureSession } from '../../src/models/assistedCaptureSession.model.js';
import { DiscoveryAgentJob } from '../../src/models/discoveryAgentJob.model.js';
import {
    ackCaptureRequest,
    claimAssistedCaptureSession,
    consumeCaptureRequest,
    createAssistedCaptureSession,
    getPendingCaptureRequest,
    requestCaptureVisibleResults,
} from '../../src/services/dataExtractor/searchCampaign/assistedCapture/index.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `CR5B-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const userAId = new mongoose.Types.ObjectId();

const fullUser = {
    _id: userAId,
    id: userAId,
    roleName: 'staff',
    additionalPermissions: {
        data_extractor: {
            search_campaign: { view: true, manage: true },
            search_query: { view: true, manage: true, open: true, review: true },
            raw_capture: { view: true, ingest: true, manage: true },
            assisted_capture: { view: true, start: true, manage: true },
        },
    },
};

let campaign;
let query;
let keyN = 0;

function nextKey(prefix) {
    keyN += 1;
    return `${prefix}-${TAG}-${keyN}`;
}

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    assert.doesNotMatch(MONGO_URI, /prod|atlas|mongodb\.net/i);
    await mongoose.connect(MONGO_URI);

    campaign = await SearchCampaign.create({
        companyId: companyA,
        name: `CR5B Camp ${TAG}`,
        nameNormalized: `cr5b camp ${TAG}`,
        targetIndustry: 'Home Automation',
        country: '',
        sources: ['google'],
        status: 'active',
        createdBy: userAId,
    });
    query = await SearchQuery.create({
        companyId: companyA,
        campaignId: campaign._id,
        queryText: `home automation manufacturers ${TAG}`,
        queryNormalized: `home automation manufacturers ${TAG}`,
        sourceHint: 'google',
        status: 'approved',
        generationMethod: 'manual',
        queryType: 'manual',
        searchUrl: 'https://www.google.com/search?q=home+automation+manufacturers',
    });
});

after(async () => {
    await AssistedCaptureSession.deleteMany({ companyId: companyA }).catch(() => null);
    await DiscoveryAgentJob.deleteMany({ companyId: companyA }).catch(() => null);
    await SearchQuery.deleteMany({ companyId: companyA }).catch(() => null);
    await SearchCampaign.deleteMany({ companyId: companyA }).catch(() => null);
    await mongoose.disconnect();
});

async function openSession() {
    const created = await createAssistedCaptureSession({
        companyId: companyA,
        user: fullUser,
        campaignId: campaign._id,
        queryId: query._id,
        body: { idempotencyKey: nextKey('sess') },
    });
    const claim = await claimAssistedCaptureSession({
        companyId: companyA,
        sessionId: created.session._id,
        agentInstanceId: 'agent-cr5b-1',
    });
    const session = await AssistedCaptureSession.findOne({ _id: created.session._id, companyId: companyA });
    session.status = 'awaiting_user';
    session.browserOpenedAcked = true;
    await session.save();
    return { session, sessionToken: claim.sessionToken, agentInstanceId: 'agent-cr5b-1' };
}

describe('CP5B captureRequest', () => {
    it('rejects body.companyId and requires idempotencyKey', async () => {
        const { session } = await openSession();
        await assert.rejects(
            () => requestCaptureVisibleResults({
                companyId: companyA,
                user: fullUser,
                campaignId: campaign._id,
                queryId: query._id,
                sessionId: session._id,
                body: { companyId: String(companyA), idempotencyKey: nextKey('bad') },
            }),
            (err) => err.statusCode === 400 && /companyId/i.test(err.message),
        );
        await assert.rejects(
            () => requestCaptureVisibleResults({
                companyId: companyA,
                user: fullUser,
                campaignId: campaign._id,
                queryId: query._id,
                sessionId: session._id,
                body: {},
            }),
            (err) => err.statusCode === 400 && /idempotencyKey/i.test(err.message),
        );
    });

    it('request → pending → ack → consume; same key idempotent; different pending 409', async () => {
        const { session, sessionToken, agentInstanceId } = await openSession();
        const key = nextKey('cap');

        const req1 = await requestCaptureVisibleResults({
            companyId: companyA,
            user: fullUser,
            campaignId: campaign._id,
            queryId: query._id,
            sessionId: session._id,
            body: { idempotencyKey: key },
        });
        assert.equal(req1.idempotentReplay, false);
        assert.equal(req1.pendingCapture.pendingCaptureStatus, 'pending');

        const pending = await getPendingCaptureRequest({ companyId: companyA, sessionId: session._id });
        assert.equal(pending.pending, true);
        assert.equal(pending.idempotencyKey, key);

        const ack = await ackCaptureRequest({
            companyId: companyA,
            sessionId: session._id,
            agentInstanceId,
            idempotencyKey: key,
            token: sessionToken,
        });
        assert.equal(ack.idempotentReplay, false);
        assert.equal(ack.pendingCapture.pendingCaptureStatus, 'acked');

        const ack2 = await ackCaptureRequest({
            companyId: companyA,
            sessionId: session._id,
            agentInstanceId,
            idempotencyKey: key,
            token: sessionToken,
        });
        assert.equal(ack2.idempotentReplay, true);

        const consumed = await consumeCaptureRequest({
            companyId: companyA,
            sessionId: session._id,
            idempotencyKey: key,
        });
        assert.equal(consumed.cleared, true);
        assert.equal(consumed.pendingCapture.pendingCaptureStatus, 'none');

        const after = await getPendingCaptureRequest({ companyId: companyA, sessionId: session._id });
        assert.equal(after.pending, false);

        const replay = await requestCaptureVisibleResults({
            companyId: companyA,
            user: fullUser,
            campaignId: campaign._id,
            queryId: query._id,
            sessionId: session._id,
            body: { idempotencyKey: key },
        });
        assert.equal(replay.idempotentReplay, true);

        const key2 = nextKey('cap2');
        const req2 = await requestCaptureVisibleResults({
            companyId: companyA,
            user: fullUser,
            campaignId: campaign._id,
            queryId: query._id,
            sessionId: session._id,
            body: { idempotencyKey: key2 },
        });
        assert.equal(req2.idempotentReplay, false);
        assert.equal(req2.pendingCapture.pendingCaptureStatus, 'pending');

        await assert.rejects(
            () => requestCaptureVisibleResults({
                companyId: companyA,
                user: fullUser,
                campaignId: campaign._id,
                queryId: query._id,
                sessionId: session._id,
                body: { idempotencyKey: nextKey('cap3') },
            }),
            (err) => err.statusCode === 409,
        );
    });

    it('rejects capture request when session not browser-open', async () => {
        const created = await createAssistedCaptureSession({
            companyId: companyA,
            user: fullUser,
            campaignId: campaign._id,
            queryId: query._id,
            body: { idempotencyKey: nextKey('queued-sess') },
        });
        await assert.rejects(
            () => requestCaptureVisibleResults({
                companyId: companyA,
                user: fullUser,
                campaignId: campaign._id,
                queryId: query._id,
                sessionId: created.session._id,
                body: { idempotencyKey: nextKey('too-early') },
            }),
            (err) => err.statusCode === 400,
        );
    });
});