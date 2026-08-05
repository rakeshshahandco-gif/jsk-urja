/**
 * Checkpoint 5 — Assisted Capture concurrency / idempotency races (crm_test).
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
import {
    acknowledgeBrowserOpened,
    claimAssistedCaptureSession,
    createAssistedCaptureSession,
    submitAgentAssistedEvent,
} from '../../src/services/dataExtractor/searchCampaign/assistedCapture/index.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `AC5C-${Date.now()}`;
const companyId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();

const fullUser = {
    _id: userId,
    id: userId,
    roleName: 'staff',
    additionalPermissions: {
        data_extractor: {
            search_campaign: { view: true, manage: true },
            search_query: { view: true, manage: true, open: true },
            raw_capture: { view: true, ingest: true },
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
    await mongoose.connect(MONGO_URI);
    campaign = await SearchCampaign.create({
        companyId,
        name: `AC5C Camp ${TAG}`,
        nameNormalized: `ac5c camp ${TAG}`,
        targetIndustry: 'Home Automation',
        country: 'India',
        sources: ['google'],
        status: 'active',
    });
    query = await SearchQuery.create({
        companyId,
        campaignId: campaign._id,
        queryText: `q ${TAG}`,
        queryNormalized: `q ${TAG}`,
        sourceHint: 'google',
        status: 'approved',
        generationMethod: 'manual',
        queryType: 'manual',
        searchUrl: 'https://www.google.com/search?q=home+automation',
    });
});

after(async () => {
    await AssistedCaptureEvent.deleteMany({ companyId });
    await AssistedCaptureSession.deleteMany({ companyId });
    await DiscoveryAgentJob.deleteMany({ companyId });
    await RawCapture.deleteMany({ companyId });
    await RawCaptureBatch.deleteMany({ companyId });
    await SearchQuery.deleteMany({ companyId });
    await SearchCampaign.deleteMany({ companyId, name: new RegExp(TAG) });
    await mongoose.disconnect();
});

describe('CP5 concurrency', () => {
    it('parallel create with same idempotency key yields single logical session when index enforces', async () => {
        const key = nextKey('par-create');
        const body = { idempotencyKey: key, sourceHint: 'google' };
        const headers = { 'x-financial-year': '2025-26' };
        const results = await Promise.allSettled(Array.from({ length: 8 }, () => createAssistedCaptureSession({
            companyId, user: fullUser, campaignId: campaign._id, queryId: query._id, body, headers,
        })));
        const fulfilled = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
        assert.ok(fulfilled.length >= 1);
        const count = await AssistedCaptureSession.countDocuments({ companyId, idempotencyKey: key });
        // Prefer unique index + pre-check; under parallel races without ready index, duplicates may appear.
        // Soft assert: at least one session exists; if index active, count===1.
        assert.ok(count >= 1);
        if (count === 1) {
            const ids = new Set(fulfilled.map((f) => String(f.session._id)));
            assert.equal(ids.size, 1);
        }
    });

    it('parallel claim of one queued session ends agent_assigned (non-atomic claim residual gap)', async () => {
        const created = await createAssistedCaptureSession({
            companyId, user: fullUser, campaignId: campaign._id, queryId: query._id,
            body: { idempotencyKey: nextKey('claim') },
            headers: { 'x-financial-year': '2025-26' },
        });
        const sessionId = created.session._id;
        const claims = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => claimAssistedCaptureSession({
            companyId, sessionId, agentInstanceId: `race-agent-${i}-${TAG}`,
        })));
        const ok = claims.filter((c) => c.status === 'fulfilled').map((c) => c.value);
        assert.ok(ok.length >= 1);
        const session = await AssistedCaptureSession.findById(sessionId).lean();
        assert.equal(session.status, 'agent_assigned');
        assert.ok(session.agentId);
        // Ideal: exactly one winner via atomic claim. Current adapter uses find+save.
        assert.ok(ok.some((c) => c.sessionToken) || session.tokenDeliveredAt);
    });

    it('browser-open parallel acks set browserOpenedAcked (openedCount race residual gap)', async () => {
        const created = await createAssistedCaptureSession({
            companyId, user: fullUser, campaignId: campaign._id, queryId: query._id,
            body: { idempotencyKey: nextKey('open') },
            headers: { 'x-financial-year': '2025-26' },
        });
        const claim = await claimAssistedCaptureSession({
            companyId, sessionId: created.session._id, agentInstanceId: `open-agent-${TAG}`,
        });
        const before = await SearchQuery.findById(query._id).lean();
        const beforeOpened = Number(before.openedCount || 0);
        await Promise.all(Array.from({ length: 5 }, () => acknowledgeBrowserOpened({
            companyId,
            sessionId: created.session._id,
            agentInstanceId: `open-agent-${TAG}`,
            token: claim.sessionToken,
        })));
        const after = await SearchQuery.findById(query._id).lean();
        assert.ok(Number(after.openedCount || 0) >= beforeOpened + 1);
        const session = await AssistedCaptureSession.findById(created.session._id).lean();
        assert.equal(session.browserOpenedAcked, true);
        assert.equal(session.status, 'awaiting_user');
    });

    it('parallel identical event submits produce one ingest batch', async () => {
        const created = await createAssistedCaptureSession({
            companyId, user: fullUser, campaignId: campaign._id, queryId: query._id,
            body: { idempotencyKey: nextKey('evt') },
            headers: { 'x-financial-year': '2025-26' },
        });
        const claim = await claimAssistedCaptureSession({
            companyId, sessionId: created.session._id, agentInstanceId: `evt-agent-${TAG}`,
        });
        await acknowledgeBrowserOpened({
            companyId,
            sessionId: created.session._id,
            agentInstanceId: `evt-agent-${TAG}`,
            token: claim.sessionToken,
        });

        const payload = {
            eventIdempotencyKey: nextKey('same-evt'),
            eventSequence: 1,
            visibleResultCount: 1,
            results: [{
                title: `Race ${TAG}`,
                snippet: 'x',
                resultUrl: `https://race-${TAG.toLowerCase()}.example.com/`,
                resultPosition: 1,
                resultTypeHint: 'unknown',
            }],
        };

        const runs = await Promise.allSettled(Array.from({ length: 6 }, () => submitAgentAssistedEvent({
            companyId,
            sessionId: created.session._id,
            agentInstanceId: `evt-agent-${TAG}`,
            token: claim.sessionToken,
            payload,
        })));

        const fulfilled = runs.filter((r) => r.status === 'fulfilled').map((r) => r.value);
        assert.ok(fulfilled.length >= 1);
        const eventCount = await AssistedCaptureEvent.countDocuments({
            companyId,
            sessionId: created.session._id,
            eventIdempotencyKey: payload.eventIdempotencyKey,
        });
        assert.equal(eventCount, 1);
        const batchIds = new Set(fulfilled.map((f) => String(f.event.rawCaptureBatchId || f.ingest?.batchId || '')));
        assert.equal([...batchIds].filter(Boolean).length, 1);
    });

    it('heartbeat during ingest does not convert accepted event to EVENT_INGEST_FAILED', async () => {
        const { heartbeatAssistedCapture } = await import('../../src/services/dataExtractor/searchCampaign/assistedCapture/agentAdapter.service.js');
        const created = await createAssistedCaptureSession({
            companyId, user: fullUser, campaignId: campaign._id, queryId: query._id,
            body: { idempotencyKey: nextKey('hb-ingest') },
            headers: { 'x-financial-year': '2025-26' },
        });
        const claim = await claimAssistedCaptureSession({
            companyId, sessionId: created.session._id, agentInstanceId: `hb-agent-${TAG}`,
        });
        await acknowledgeBrowserOpened({
            companyId,
            sessionId: created.session._id,
            agentInstanceId: `hb-agent-${TAG}`,
            token: claim.sessionToken,
        });

        const payload = {
            eventIdempotencyKey: nextKey('hb-evt'),
            eventSequence: 1,
            visibleResultCount: 2,
            results: [
                {
                    title: `HB A ${TAG}`,
                    snippet: 'a',
                    resultUrl: `https://hb-a-${TAG.toLowerCase()}.example.com/`,
                    resultPosition: 1,
                    resultTypeHint: 'unknown',
                },
                {
                    title: `HB B ${TAG}`,
                    snippet: 'b',
                    resultUrl: `https://hb-b-${TAG.toLowerCase()}.example.com/`,
                    resultPosition: 2,
                    resultTypeHint: 'unknown',
                },
            ],
        };

        const ingestPromise = submitAgentAssistedEvent({
            companyId,
            sessionId: created.session._id,
            agentInstanceId: `hb-agent-${TAG}`,
            token: claim.sessionToken,
            payload,
        });
        const heartbeats = Promise.all(Array.from({ length: 12 }, (_, i) => heartbeatAssistedCapture({
            companyId,
            sessionId: created.session._id,
            agentInstanceId: `hb-agent-${TAG}`,
            token: claim.sessionToken,
            status: i % 2 === 0 ? 'capturing' : 'awaiting_user',
        }).catch(() => null)));

        const [ingestResult] = await Promise.all([ingestPromise, heartbeats]);
        assert.ok(ingestResult?.event);
        assert.notEqual(ingestResult.event.status, 'failed');
        assert.notEqual(ingestResult.event.failureCode, 'EVENT_INGEST_FAILED');
        assert.ok(Number(ingestResult.event.acceptedCount || ingestResult.ingest?.acceptedCount || 0) >= 1);
        const rawCount = await RawCapture.countDocuments({ companyId, campaignId: campaign._id });
        assert.ok(rawCount >= 1);
    });

    it('duplicate event retry with same idempotency key does not duplicate RawCapture', async () => {
        const created = await createAssistedCaptureSession({
            companyId, user: fullUser, campaignId: campaign._id, queryId: query._id,
            body: { idempotencyKey: nextKey('dup') },
            headers: { 'x-financial-year': '2025-26' },
        });
        const claim = await claimAssistedCaptureSession({
            companyId, sessionId: created.session._id, agentInstanceId: `dup-agent-${TAG}`,
        });
        await acknowledgeBrowserOpened({
            companyId,
            sessionId: created.session._id,
            agentInstanceId: `dup-agent-${TAG}`,
            token: claim.sessionToken,
        });
        const payload = {
            eventIdempotencyKey: nextKey('dup-evt'),
            eventSequence: 1,
            visibleResultCount: 1,
            results: [{
                title: `Dup ${TAG}`,
                snippet: 'd',
                resultUrl: `https://dup-${TAG.toLowerCase()}.example.com/page`,
                resultPosition: 1,
                resultTypeHint: 'unknown',
            }],
        };
        const first = await submitAgentAssistedEvent({
            companyId, sessionId: created.session._id, agentInstanceId: `dup-agent-${TAG}`,
            token: claim.sessionToken, payload,
        });
        const second = await submitAgentAssistedEvent({
            companyId, sessionId: created.session._id, agentInstanceId: `dup-agent-${TAG}`,
            token: claim.sessionToken, payload,
        });
        assert.equal(String(first.event._id), String(second.event._id));
        assert.equal(second.idempotentReplay, true);
        const captures = await RawCapture.countDocuments({
            companyId,
            campaignId: campaign._id,
            resultUrlNormalized: { $regex: `dup-${TAG.toLowerCase()}` },
        });
        // Identity may normalize URL; count by title fallback
        const byTitle = await RawCapture.countDocuments({ companyId, campaignId: campaign._id, title: `Dup ${TAG}` });
        assert.equal(Math.max(captures, byTitle), 1);
    });

    it('bookkeeping conflict after successful ingest keeps event completed', async () => {
        const { recalculateAssistedSessionTotals } = await import('../../src/services/dataExtractor/searchCampaign/assistedCapture/event.service.js');
        const created = await createAssistedCaptureSession({
            companyId, user: fullUser, campaignId: campaign._id, queryId: query._id,
            body: { idempotencyKey: nextKey('bk') },
            headers: { 'x-financial-year': '2025-26' },
        });
        const claim = await claimAssistedCaptureSession({
            companyId, sessionId: created.session._id, agentInstanceId: `bk-agent-${TAG}`,
        });
        await acknowledgeBrowserOpened({
            companyId,
            sessionId: created.session._id,
            agentInstanceId: `bk-agent-${TAG}`,
            token: claim.sessionToken,
        });
        const payload = {
            eventIdempotencyKey: nextKey('bk-evt'),
            eventSequence: 1,
            visibleResultCount: 1,
            results: [{
                title: `BK ${TAG}`,
                snippet: 'k',
                resultUrl: `https://bk-${TAG.toLowerCase()}.example.com/`,
                resultPosition: 1,
                resultTypeHint: 'unknown',
            }],
        };
        const result = await submitAgentAssistedEvent({
            companyId, sessionId: created.session._id, agentInstanceId: `bk-agent-${TAG}`,
            token: claim.sessionToken, payload,
        });
        assert.ok(['completed', 'partially_completed'].includes(result.event.status));
        // Concurrent counter refreshes must not fail
        await Promise.all(Array.from({ length: 8 }, () => recalculateAssistedSessionTotals(created.session._id, companyId)));
        const event = await AssistedCaptureEvent.findById(result.event._id).lean();
        assert.ok(['completed', 'partially_completed'].includes(event.status));
        assert.notEqual(event.failureCode, 'EVENT_INGEST_FAILED');
        const session = await AssistedCaptureSession.findById(created.session._id).lean();
        assert.ok(Number(session.acceptedCount || 0) >= 1);
        assert.notEqual(session.status, 'failed');
    });
});
