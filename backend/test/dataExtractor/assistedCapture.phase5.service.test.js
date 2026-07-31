/**
 * Checkpoint 5 — Assisted Capture service scenarios (Part 28 style, crm_test).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { SearchQuery } from '../../src/models/searchQuery.model.js';
import { AssistedCaptureSession } from '../../src/models/assistedCaptureSession.model.js';
import { AssistedCaptureEvent } from '../../src/models/assistedCaptureEvent.model.js';
import { DiscoveryAgentJob } from '../../src/models/discoveryAgentJob.model.js';
import { RawCapture } from '../../src/models/rawCapture.model.js';
import { RawCaptureBatch } from '../../src/models/rawCaptureBatch.model.js';
import { ExtractedLead } from '../../src/models/extractedLead.model.js';
import { Lead } from '../../src/models/lead.model.js';
import {
    acknowledgeBrowserOpened,
    cancelAssistedCaptureSession,
    claimAssistedCaptureSession,
    completeAssistedByAgent,
    completeAssistedCaptureSessionByUser,
    createAssistedCaptureSession,
    failAssistedByAgent,
    getAssistedCaptureSession,
    heartbeatAssistedCapture,
    listAssistedCaptureSessions,
    setManualActionRequired,
    submitAgentAssistedEvent,
} from '../../src/services/dataExtractor/searchCampaign/assistedCapture/index.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `AC5S-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
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

const viewOnlyUser = {
    _id: new mongoose.Types.ObjectId(),
    id: null,
    roleName: 'staff',
    additionalPermissions: {
        data_extractor: {
            search_campaign: { view: true },
            search_query: { view: true },
            assisted_capture: { view: true, start: false, manage: false },
        },
    },
};

let campaignA;
let campaignB;
let queryA;
let queryB;
let closedCampaign;
let draftQuery;
let leadsBefore;
let crmBefore;
let keyN = 0;

function nextKey(prefix) {
    keyN += 1;
    return `${prefix}-${TAG}-${keyN}`;
}

function resultRow(i = 1) {
    return {
        title: `Co ${i} ${TAG}`,
        snippet: `Snippet ${i}`,
        resultUrl: `https://svc-${i}-${TAG.toLowerCase()}.example.com/`,
        resultPosition: i,
        resultTypeHint: 'unknown',
    };
}

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    assert.doesNotMatch(MONGO_URI, /prod|atlas|mongodb\.net/i);
    await mongoose.connect(MONGO_URI);
    leadsBefore = await ExtractedLead.countDocuments({}).catch(() => 0);
    crmBefore = await Lead.countDocuments({}).catch(() => 0);

    campaignA = await SearchCampaign.create({
        companyId: companyA,
        name: `AC5 Camp A ${TAG}`,
        nameNormalized: `ac5 camp a ${TAG}`,
        targetIndustry: 'Home Automation',
        country: 'India',
        sources: ['google'],
        status: 'active',
        createdBy: userAId,
    });
    campaignB = await SearchCampaign.create({
        companyId: companyB,
        name: `AC5 Camp B ${TAG}`,
        nameNormalized: `ac5 camp b ${TAG}`,
        targetIndustry: 'Other',
        country: 'India',
        sources: ['google'],
        status: 'active',
    });
    closedCampaign = await SearchCampaign.create({
        companyId: companyA,
        name: `AC5 Closed ${TAG}`,
        nameNormalized: `ac5 closed ${TAG}`,
        targetIndustry: 'Home Automation',
        country: 'India',
        sources: ['google'],
        status: 'closed',
    });
    queryA = await SearchQuery.create({
        companyId: companyA,
        campaignId: campaignA._id,
        queryText: `home automation ${TAG}`,
        queryNormalized: `home automation ${TAG}`,
        sourceHint: 'google',
        status: 'approved',
        generationMethod: 'manual',
        queryType: 'manual',
        searchUrl: 'https://www.google.com/search?q=home+automation',
    });
    draftQuery = await SearchQuery.create({
        companyId: companyA,
        campaignId: campaignA._id,
        queryText: `draft ${TAG}`,
        queryNormalized: `draft ${TAG}`,
        sourceHint: 'google',
        status: 'draft',
        generationMethod: 'manual',
        queryType: 'manual',
        searchUrl: 'https://www.google.com/search?q=draft',
    });
    queryB = await SearchQuery.create({
        companyId: companyB,
        campaignId: campaignB._id,
        queryText: `b ${TAG}`,
        queryNormalized: `b ${TAG}`,
        sourceHint: 'google',
        status: 'approved',
        generationMethod: 'manual',
        queryType: 'manual',
        searchUrl: 'https://www.google.com/search?q=other',
    });
});

after(async () => {
    await AssistedCaptureEvent.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await AssistedCaptureSession.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await DiscoveryAgentJob.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await RawCapture.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await RawCaptureBatch.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await SearchQuery.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await SearchCampaign.deleteMany({ companyId: { $in: [companyA, companyB] }, name: new RegExp(TAG) });
    await mongoose.disconnect();
});

describe('CP5 service — create eligibility and token hash', () => {
    it('creates session for approved query; stores tokenHash only; no plain token on session API', async () => {
        const created = await createAssistedCaptureSession({
            companyId: companyA,
            user: fullUser,
            campaignId: campaignA._id,
            queryId: queryA._id,
            body: { idempotencyKey: nextKey('create') },
            headers: { 'x-financial-year': '2025-26' },
        });
        assert.equal(created.idempotentReplay, false);
        assert.equal(created.session.status, 'queued');
        assert.equal(created.session.searchUrl, 'https://www.google.com/search?q=home+automation');
        assert.equal(Object.prototype.hasOwnProperty.call(created.session, 'tokenHash'), false);
        assert.equal(created.session.sessionToken, undefined);
        assert.equal(created.session.token, undefined);

        const raw = await AssistedCaptureSession.findById(created.session._id).lean();
        assert.ok(raw.tokenHash);
        assert.match(raw.tokenHash, /^[a-f0-9]{64}$/);
        assert.equal(raw.token, undefined);

        const job = await DiscoveryAgentJob.findById(raw.discoveryAgentJobId).lean();
        assert.equal(job.sourceMode, 'assisted_google_capture');
        assert.ok(job.metadata?.pendingSessionToken);
        assert.match(job.metadata.pendingSessionToken, /^jskac_/);
    });

    it('rejects ineligible campaign/query and forbidden body fields', async () => {
        await assert.rejects(() => createAssistedCaptureSession({
            companyId: companyA, user: fullUser, campaignId: closedCampaign._id, queryId: queryA._id, body: {},
        }), /cannot accept assisted capture/i);

        await assert.rejects(() => createAssistedCaptureSession({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: draftQuery._id, body: {},
        }), /Cannot create assisted capture for query status/i);

        await assert.rejects(() => createAssistedCaptureSession({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: queryA._id,
            body: { searchUrl: 'https://www.google.com/search?q=x' },
        }), /searchUrl is not allowed/i);

        await assert.rejects(() => createAssistedCaptureSession({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: queryA._id,
            body: { companyId: String(companyB) },
        }), /companyId is not allowed/i);

        await assert.rejects(() => createAssistedCaptureSession({
            companyId: companyA, user: viewOnlyUser, campaignId: campaignA._id, queryId: queryA._id, body: {},
        }), /Permission denied/i);
    });

    it('session create idempotency replay and conflict', async () => {
        const key = nextKey('sidem');
        const first = await createAssistedCaptureSession({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: queryA._id,
            body: { idempotencyKey: key, sourceHint: 'google' },
            headers: { 'x-financial-year': '2025-26' },
        });
        const second = await createAssistedCaptureSession({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: queryA._id,
            body: { idempotencyKey: key, sourceHint: 'google' },
            headers: { 'x-financial-year': '2025-26' },
        });
        assert.equal(second.idempotentReplay, true);
        assert.equal(String(second.session._id), String(first.session._id));

        await assert.rejects(() => createAssistedCaptureSession({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: queryA._id,
            body: { idempotencyKey: key, sourceHint: 'web' },
            headers: { 'x-financial-year': '2025-26' },
        }), (err) => err.errorCode === 'IDEMPOTENCY_KEY_REUSED' || /Idempotency key/i.test(err.message));
    });
});

describe('CP5 service — claim / browser-open / events / terminal', () => {
    let sessionId;
    let sessionToken;
    const agentId = `agent-${TAG}`;

    it('claim delivers plain token once; browser-open is idempotent; events ingest RawCapture only', async () => {
        const created = await createAssistedCaptureSession({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: queryA._id,
            body: { idempotencyKey: nextKey('flow') },
            headers: { 'x-financial-year': '2025-26' },
        });
        sessionId = created.session._id;

        const claim1 = await claimAssistedCaptureSession({
            companyId: companyA, sessionId, agentInstanceId: agentId,
        });
        assert.ok(claim1.sessionToken);
        assert.match(claim1.sessionToken, /^jskac_/);
        sessionToken = claim1.sessionToken;
        assert.equal(claim1.session.status, 'agent_assigned');
        assert.equal(Object.prototype.hasOwnProperty.call(claim1.session, 'tokenHash'), false);

        const job = await DiscoveryAgentJob.findById(created.session.discoveryAgentJobId).lean();
        assert.equal(job.metadata?.pendingSessionToken, undefined);

        const claim2 = await claimAssistedCaptureSession({
            companyId: companyA, sessionId, agentInstanceId: agentId,
        }).catch((e) => e);
        // second claim: session no longer queued
        assert.ok(claim2.statusCode === 404 || claim2.message);

        // re-open path: create fresh for claim2 tokenless check using new session already assigned is not reclaimable.
        // Browser open idempotent on claimed session:
        const open1 = await acknowledgeBrowserOpened({
            companyId: companyA, sessionId, agentInstanceId: agentId, token: sessionToken,
        });
        assert.equal(open1.session.status, 'awaiting_user');
        assert.equal(open1.browserOpenedAcked, true);
        const open2 = await acknowledgeBrowserOpened({
            companyId: companyA, sessionId, agentInstanceId: agentId, token: sessionToken,
        });
        assert.equal(open2.session.browserOpenedAcked, true);
        const qAfter = await SearchQuery.findById(queryA._id).lean();
        assert.ok(Number(qAfter.openedCount || 0) >= 1);

        await heartbeatAssistedCapture({
            companyId: companyA, sessionId, agentInstanceId: agentId, token: sessionToken, status: 'ready_to_capture',
        });
        await setManualActionRequired({
            companyId: companyA, sessionId, agentInstanceId: agentId, token: sessionToken, message: 'captcha',
        });

        const eventPayload = {
            eventIdempotencyKey: nextKey('evt'),
            eventSequence: 1,
            visibleResultCount: 2,
            results: [resultRow(1), resultRow(2)],
        };
        const ev1 = await submitAgentAssistedEvent({
            companyId: companyA, sessionId, agentInstanceId: agentId, token: sessionToken, payload: eventPayload,
        });
        assert.equal(ev1.idempotentReplay, false);
        assert.ok(ev1.ingest?.batchId);
        assert.ok(Number(ev1.ingest.acceptedCount) >= 1);

        const ev2 = await submitAgentAssistedEvent({
            companyId: companyA, sessionId, agentInstanceId: agentId, token: sessionToken, payload: eventPayload,
        });
        assert.equal(ev2.idempotentReplay, true);

        await assert.rejects(() => submitAgentAssistedEvent({
            companyId: companyA, sessionId, agentInstanceId: agentId, token: sessionToken,
            payload: { ...eventPayload, results: [resultRow(99)], visibleResultCount: 1 },
        }), (err) => err.errorCode === 'IDEMPOTENCY_KEY_REUSED');

        await assert.rejects(() => submitAgentAssistedEvent({
            companyId: companyA, sessionId, agentInstanceId: agentId, token: sessionToken,
            payload: {
                eventIdempotencyKey: nextKey('html'),
                eventSequence: 2,
                visibleResultCount: 1,
                results: [resultRow(3)],
                html: '<html></html>',
            },
        }), /HTML\/DOM\/cookies\/screenshot/i);

        await assert.rejects(() => submitAgentAssistedEvent({
            companyId: companyA, sessionId, agentInstanceId: agentId, token: sessionToken,
            payload: {
                eventIdempotencyKey: nextKey('max'),
                eventSequence: 3,
                visibleResultCount: 101,
                results: Array.from({ length: 101 }, (_, i) => resultRow(i + 10)),
            },
        }), /at most 100/i);

        const rawCount = await RawCapture.countDocuments({ companyId: companyA, campaignId: campaignA._id });
        assert.ok(rawCount >= 1);
        assert.equal(await ExtractedLead.countDocuments({}).catch(() => 0), leadsBefore);
        assert.equal(await Lead.countDocuments({}).catch(() => 0), crmBefore);

        await completeAssistedByAgent({
            companyId: companyA, sessionId, agentInstanceId: agentId, token: sessionToken,
        });
        const done = await getAssistedCaptureSession({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: queryA._id, sessionId,
        });
        assert.equal(done.status, 'completed');

        await assert.rejects(() => submitAgentAssistedEvent({
            companyId: companyA, sessionId, agentInstanceId: agentId, token: sessionToken,
            payload: {
                eventIdempotencyKey: nextKey('after'),
                eventSequence: 4,
                visibleResultCount: 1,
                results: [resultRow(50)],
            },
        }), /cannot accept capture events/i);
    });

    it('cancel rejects further events; cross-company get 404; list works', async () => {
        const created = await createAssistedCaptureSession({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: queryA._id,
            body: { idempotencyKey: nextKey('cancel') },
            headers: { 'x-financial-year': '2025-26' },
        });
        const claim = await claimAssistedCaptureSession({
            companyId: companyA, sessionId: created.session._id, agentInstanceId: `${agentId}-c`,
        });
        await cancelAssistedCaptureSession({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: queryA._id, sessionId: created.session._id,
        });
        await assert.rejects(() => submitAgentAssistedEvent({
            companyId: companyA, sessionId: created.session._id, agentInstanceId: `${agentId}-c`, token: claim.sessionToken,
            payload: {
                eventIdempotencyKey: nextKey('cancelev'),
                eventSequence: 1,
                visibleResultCount: 1,
                results: [resultRow(70)],
            },
        }), /cannot accept capture events/i);

        await assert.rejects(() => getAssistedCaptureSession({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: queryA._id, sessionId: new mongoose.Types.ObjectId(),
        }), /not found/i);

        await assert.rejects(() => createAssistedCaptureSession({
            companyId: companyA, user: fullUser, campaignId: campaignB._id, queryId: queryB._id, body: {},
        }), /not found/i);

        const listed = await listAssistedCaptureSessions({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: queryA._id, query: { limit: 10 },
        });
        assert.ok(listed.items.length >= 1);

        const created2 = await createAssistedCaptureSession({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: queryA._id,
            body: { idempotencyKey: nextKey('fail') },
            headers: { 'x-financial-year': '2025-26' },
        });
        const claimF = await claimAssistedCaptureSession({
            companyId: companyA, sessionId: created2.session._id, agentInstanceId: `${agentId}-f`,
        });
        await failAssistedByAgent({
            companyId: companyA, sessionId: created2.session._id, agentInstanceId: `${agentId}-f`,
            token: claimF.sessionToken, code: 'TEST_FAIL', message: 'boom',
        });
        const failed = await getAssistedCaptureSession({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: queryA._id, sessionId: created2.session._id,
        });
        assert.equal(failed.status, 'failed');

        const created3 = await createAssistedCaptureSession({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: queryA._id,
            body: { idempotencyKey: nextKey('usercomplete') },
            headers: { 'x-financial-year': '2025-26' },
        });
        await completeAssistedCaptureSessionByUser({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: queryA._id, sessionId: created3.session._id,
        });
        const completed = await getAssistedCaptureSession({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: queryA._id, sessionId: created3.session._id,
        });
        assert.equal(completed.status, 'completed');
    });
});
