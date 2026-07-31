/**
 * Checkpoint 3A — RawCapture integrity hardening tests (crm_test only).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { SearchQuery } from '../../src/models/searchQuery.model.js';
import { RawCapture } from '../../src/models/rawCapture.model.js';
import { RawCaptureBatch } from '../../src/models/rawCaptureBatch.model.js';
import { ExtractedLead } from '../../src/models/extractedLead.model.js';
import {
    ingestRawCaptures,
    recalculateSearchQueryCaptureStats,
    reconcileRawCaptureBatch,
} from '../../src/services/dataExtractor/searchCampaign/rawCapture/rawCapture.ingestion.service.js';
import { archiveRawCapture } from '../../src/services/dataExtractor/searchCampaign/rawCapture/rawCapture.inbox.service.js';
import {
    buildCaptureFingerprint,
    buildRequestFingerprint,
    normalizeResultUrl,
} from '../../src/services/dataExtractor/searchCampaign/rawCapture/normalize.util.js';
import {
    RAW_CAPTURE_BATCH_IDEMPOTENCY_INDEX_NAME,
    RAW_CAPTURE_IDENTITY_INDEX_NAME,
} from '../../src/services/dataExtractor/searchCampaign/rawCapture/constants.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `RC3A-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();

const fullUser = {
    _id: userId,
    id: userId,
    roleName: 'staff',
    additionalPermissions: {
        data_extractor: {
            search_campaign: { view: true, manage: false },
            search_query: { view: true, manage: true, generate: false, review: false, open: true },
            raw_capture: { view: true, ingest: true, manage: true, archive: true },
        },
    },
};

let campaignA;
let campaignB;
let queryA;
let leadsBefore;

async function makeQuery(overrides = {}) {
    return SearchQuery.create({
        companyId: companyA,
        campaignId: campaignA._id,
        queryText: `q ${TAG} ${Math.random().toString(36).slice(2, 7)}`,
        queryNormalized: `q ${TAG} ${Math.random().toString(36).slice(2, 7)}`,
        sourceHint: 'google',
        status: 'approved',
        generationMethod: 'manual',
        queryType: 'manual',
        searchUrl: 'https://www.google.com/search?q=x',
        ...overrides,
    });
}

function ingestBody(overrides = {}) {
    return {
        source: 'google',
        captureMethod: 'api_batch',
        idempotencyKey: `k-${TAG}-${Math.random().toString(36).slice(2)}`,
        queryId: String(queryA._id),
        records: [{ title: 'Co', resultUrl: `https://ex-${TAG.toLowerCase()}.example.com/path` }],
        ...overrides,
    };
}

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    assert.doesNotMatch(MONGO_URI, /prod|atlas|mongodb\.net/i);
    await mongoose.connect(MONGO_URI);
    await RawCapture.syncIndexes();
    await RawCaptureBatch.syncIndexes();
    leadsBefore = await ExtractedLead.countDocuments({}).catch(() => 0);

    campaignA = await SearchCampaign.create({
        companyId: companyA, name: `3A A ${TAG}`, nameNormalized: `3a a ${TAG}`,
        targetIndustry: 'Home Automation', country: 'India', sources: ['google'], status: 'active',
    });
    campaignB = await SearchCampaign.create({
        companyId: companyB, name: `3A B ${TAG}`, nameNormalized: `3a b ${TAG}`,
        targetIndustry: 'Other', country: 'India', sources: ['google'], status: 'active',
    });
    queryA = await makeQuery();
});

after(async () => {
    await RawCapture.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await RawCaptureBatch.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await SearchQuery.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await SearchCampaign.deleteMany({ companyId: { $in: [companyA, companyB] }, name: new RegExp(TAG) });
    await mongoose.disconnect();
});

describe('Checkpoint 3A — indexes', () => {
    it('confirms RawCapture and RawCaptureBatch indexes exist', async () => {
        const rc = await RawCapture.collection.indexes();
        const bat = await RawCaptureBatch.collection.indexes();
        const names = rc.map((i) => i.name);
        assert.ok(names.includes(RAW_CAPTURE_IDENTITY_INDEX_NAME));
        assert.ok(names.some((n) => n.includes('inboxStatus') || JSON.stringify(rc).includes('inboxStatus')));
        assert.ok(bat.find((i) => i.name === RAW_CAPTURE_BATCH_IDEMPOTENCY_INDEX_NAME)?.unique);
        assert.ok(bat.some((i) => i.key && i.key.campaignId === 1 && i.key.createdAt === -1));
    });
});

describe('Checkpoint 3A — request fingerprint idempotency', () => {
    it('same key + same payload replays without double counting', async () => {
        const q = await makeQuery();
        const key = `same-${TAG}`;
        const body = ingestBody({
            idempotencyKey: key,
            queryId: String(q._id),
            records: [{ title: 'Same', resultUrl: `https://same-${TAG.toLowerCase()}.example.com/` }],
        });
        const r1 = await ingestRawCaptures({ companyId: companyA, user: fullUser, campaignId: campaignA._id, body });
        assert.equal(r1.idempotentReplay, false);
        assert.equal(r1.queryCaptureCount, 1);
        assert.equal(r1.queryResultCount, 1);
        const seen1 = (await RawCapture.findById(r1.rawCaptureIds[0]).lean()).seenCount;

        const r2 = await ingestRawCaptures({ companyId: companyA, user: fullUser, campaignId: campaignA._id, body });
        assert.equal(r2.idempotentReplay, true);
        assert.equal(String(r2.batchId), String(r1.batchId));
        assert.equal(r2.queryCaptureCount, 1);
        assert.equal(r2.queryResultCount, 1);
        const seen2 = (await RawCapture.findById(r1.rawCaptureIds[0]).lean()).seenCount;
        assert.equal(seen2, seen1);
        assert.equal(await RawCaptureBatch.countDocuments({ companyId: companyA, idempotencyKey: key }), 1);
    });

    it('same key + different payload returns 409 IDEMPOTENCY_KEY_REUSED', async () => {
        const q = await makeQuery();
        const key = `diff-${TAG}`;
        await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: ingestBody({
                idempotencyKey: key, queryId: String(q._id),
                records: [{ title: 'A', resultUrl: `https://diff-a-${TAG.toLowerCase()}.example.com/` }],
            }),
        });
        await assert.rejects(
            () => ingestRawCaptures({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: ingestBody({
                    idempotencyKey: key, queryId: String(q._id),
                    records: [{ title: 'B', resultUrl: `https://diff-b-${TAG.toLowerCase()}.example.com/` }],
                }),
            }),
            (e) => e.statusCode === 409 && e.errorCode === 'IDEMPOTENCY_KEY_REUSED',
        );
        // different query also conflicts
        const q2 = await makeQuery();
        await assert.rejects(
            () => ingestRawCaptures({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: ingestBody({
                    idempotencyKey: key, queryId: String(q2._id),
                    records: [{ title: 'A', resultUrl: `https://diff-a-${TAG.toLowerCase()}.example.com/` }],
                }),
            }),
            (e) => e.statusCode === 409,
        );
    });

    it('same key may be used independently by another company', async () => {
        const key = `crossco-${TAG}`;
        const bodyA = {
            source: 'google', captureMethod: 'api_batch', idempotencyKey: key, queryId: null,
            records: [{ title: 'A', resultUrl: `https://coa-${TAG.toLowerCase()}.example.com/` }],
        };
        await ingestRawCaptures({ companyId: companyA, user: fullUser, campaignId: campaignA._id, body: bodyA });
        // company B needs its own user perms - reuse fullUser shape with company B campaign ownership via getOwnedSearchCampaign
        // Create campaign under B already; permissions are user-based not company-based in tests
        const rB = await ingestRawCaptures({
            companyId: companyB, user: fullUser, campaignId: campaignB._id,
            body: {
                ...bodyA,
                records: [{ title: 'B', resultUrl: `https://cob-${TAG.toLowerCase()}.example.com/` }],
            },
        });
        assert.equal(rB.idempotentReplay, false);
        assert.equal(await RawCaptureBatch.countDocuments({ idempotencyKey: key }), 2);
    });
});

describe('Checkpoint 3A — concurrency', () => {
    it('parallel same key/payload creates one batch and does not double counters', async () => {
        const q = await makeQuery();
        const key = `conc-${TAG}`;
        const body = ingestBody({
            idempotencyKey: key,
            queryId: String(q._id),
            records: [{ title: 'Conc', resultUrl: `https://conc-${TAG.toLowerCase()}.example.com/` }],
        });
        const [a, b] = await Promise.all([
            ingestRawCaptures({ companyId: companyA, user: fullUser, campaignId: campaignA._id, body }),
            ingestRawCaptures({ companyId: companyA, user: fullUser, campaignId: campaignA._id, body: { ...body } }),
        ]);
        assert.equal(String(a.batchId), String(b.batchId));
        assert.ok(a.idempotentReplay || b.idempotentReplay);
        assert.equal(await RawCaptureBatch.countDocuments({ companyId: companyA, idempotencyKey: key }), 1);
        const qDoc = await SearchQuery.findById(q._id).lean();
        assert.equal(qDoc.captureCount, 1);
        assert.equal(qDoc.resultCount, 1);
    });
});

describe('Checkpoint 3A — capture fingerprint stability', () => {
    it('URL identity ignores title/snippet/position/tracking/fragment; sourceRecordId and text fallbacks work', async () => {
        const q = await makeQuery();
        const baseUrl = `https://stable-${TAG.toLowerCase()}.example.com/item`;
        const r1 = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: ingestBody({
                queryId: String(q._id), idempotencyKey: `fp1-${TAG}`,
                records: [{ title: 'T1', snippet: 'S1', resultUrl: `${baseUrl}?utm_source=x#frag`, resultPosition: 1 }],
            }),
        });
        const r2 = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: ingestBody({
                queryId: String(q._id), idempotencyKey: `fp2-${TAG}`,
                records: [{ title: 'T2', snippet: 'S2', resultUrl: baseUrl, resultPosition: 9 }],
            }),
        });
        assert.equal(r2.updatedExistingCount, 1);
        assert.equal(String(r2.rawCaptureIds[0]), String(r1.rawCaptureIds[0]));
        const doc = await RawCapture.findById(r1.rawCaptureIds[0]).lean();
        assert.equal(doc.resultPosition, 9);
        assert.ok(doc.seenCount >= 2);

        // no-URL + sourceRecordId
        const sid = `SRC-${TAG}`;
        const s1 = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: ingestBody({
                queryId: String(q._id), idempotencyKey: `sid1-${TAG}`,
                records: [{ title: 'NoUrl1', snippet: 'a', sourceRecordId: sid }],
            }),
        });
        const s2 = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: ingestBody({
                queryId: String(q._id), idempotencyKey: `sid2-${TAG}`,
                records: [{ title: 'NoUrl2', snippet: 'b', sourceRecordId: sid }],
            }),
        });
        assert.equal(s2.updatedExistingCount, 1);
        assert.equal(String(s2.rawCaptureIds[0]), String(s1.rawCaptureIds[0]));

        // text fallback different title+snippet → new identity
        const t1 = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: ingestBody({
                queryId: String(q._id), idempotencyKey: `txt1-${TAG}`,
                records: [{ title: 'Alpha Alone', snippet: 'one' }],
            }),
        });
        const t2 = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: ingestBody({
                queryId: String(q._id), idempotencyKey: `txt2-${TAG}`,
                records: [{ title: 'Beta Alone', snippet: 'two' }],
            }),
        });
        assert.equal(t2.insertedCount, 1);
        assert.notEqual(String(t2.rawCaptureIds[0]), String(t1.rawCaptureIds[0]));

        assert.notEqual(
            buildCaptureFingerprint({
                source: 'google', queryScopeKey: 'q', resultUrlNormalized: normalizeResultUrl(baseUrl).normalized,
            }),
            buildCaptureFingerprint({
                source: 'google', queryScopeKey: 'q', titleNormalized: 'x', snippetNormalized: 'y',
            }),
        );
        assert.ok(buildRequestFingerprint({
            companyId: companyA, campaignId: campaignA._id, queryScopeKey: 'q', source: 'google',
            captureMethod: 'api_batch', records: [{ title: 'a' }],
        }).length === 64);
    });
});

describe('Checkpoint 3A — archived repeat + counters', () => {
    it('archived stays archived; captureCount can rise; resultCount unchanged; reconciliation works', async () => {
        const q = await makeQuery();
        const url = `https://arch-${TAG.toLowerCase()}.example.com/`;
        const r1 = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: ingestBody({ queryId: String(q._id), idempotencyKey: `arch1-${TAG}`, records: [{ title: 'Arch', resultUrl: url }] }),
        });
        assert.equal(r1.queryResultCount, 1);
        assert.equal(r1.queryCaptureCount, 1);
        await archiveRawCapture({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, rawCaptureId: r1.rawCaptureIds[0],
        });
        const before = await SearchQuery.findById(q._id).lean();
        const r2 = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: ingestBody({ queryId: String(q._id), idempotencyKey: `arch2-${TAG}`, records: [{ title: 'Arch', resultUrl: url }] }),
        });
        assert.equal(r2.updatedExistingCount, 1);
        assert.ok(r2.updatedExistingArchivedCount >= 1);
        assert.equal(r2.queryResultCount, before.resultCount);
        assert.equal(r2.queryCaptureCount, before.captureCount + 1);
        const doc = await RawCapture.findById(r1.rawCaptureIds[0]).lean();
        assert.equal(doc.inboxStatus, 'archived');
        assert.ok(doc.archivedAt);
        assert.ok(doc.seenCount >= 2);

        const recon = await recalculateSearchQueryCaptureStats(companyA, campaignA._id, q._id, userId);
        assert.equal(recon.resultCount, 1);
        assert.equal(recon.captureCount, 2);
        assert.ok(recon.lastCapturedAt);
        assert.equal(String(recon.lastCapturedBy), String(userId));

        const batchRecon = await reconcileRawCaptureBatch(companyA, r1.batchId);
        assert.equal(batchRecon.status, 'completed');
    });

    it('failed batch with zero accepted does not mark query captured', async () => {
        const q = await makeQuery({ status: 'approved' });
        const r = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: ingestBody({
                queryId: String(q._id), idempotencyKey: `fail0-${TAG}`,
                records: [{ title: '', resultUrl: 'javascript:bad' }],
            }),
        });
        assert.equal(r.status, 'failed');
        const qDoc = await SearchQuery.findById(q._id).lean();
        assert.equal(qDoc.status, 'approved');
        assert.equal(qDoc.captureCount, 0);
    });
});

describe('Checkpoint 3A — failure injection recovery', () => {
    it('fail after batch create / first upsert / before query stats; reconcile restores; no ExtractedLead', async () => {
        const q = await makeQuery();
        const key1 = `fail-create-${TAG}`;
        await assert.rejects(
            () => ingestRawCaptures({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: ingestBody({
                    queryId: String(q._id), idempotencyKey: key1,
                    records: [{ title: 'X', resultUrl: `https://fail1-${TAG.toLowerCase()}.example.com/` }],
                }),
                options: { failAfter: 'batch_create' },
            }),
            (e) => e.isTestHook,
        );
        const stuck = await RawCaptureBatch.findOne({ companyId: companyA, idempotencyKey: key1 }).lean();
        assert.equal(stuck.status, 'received');
        // Safe retry resumes the same received batch (no second batch).
        const retry1 = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: ingestBody({
                queryId: String(q._id), idempotencyKey: key1,
                records: [{ title: 'X', resultUrl: `https://fail1-${TAG.toLowerCase()}.example.com/` }],
            }),
        });
        assert.equal(String(retry1.batchId), String(stuck._id));
        assert.equal(retry1.idempotentReplay, false);
        assert.equal(retry1.status, 'completed');
        assert.equal(await RawCaptureBatch.countDocuments({ companyId: companyA, idempotencyKey: key1 }), 1);

        const key2 = `fail-upsert-${TAG}`;
        await assert.rejects(
            () => ingestRawCaptures({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: ingestBody({
                    queryId: String(q._id), idempotencyKey: key2,
                    records: [
                        { title: 'One', resultUrl: `https://fail2a-${TAG.toLowerCase()}.example.com/` },
                        { title: 'Two', resultUrl: `https://fail2b-${TAG.toLowerCase()}.example.com/` },
                    ],
                }),
                options: { failAfter: 'first_upsert' },
            }),
            (e) => e.isTestHook,
        );
        const mid = await RawCaptureBatch.findOne({ companyId: companyA, idempotencyKey: key2 }).lean();
        assert.equal(mid.status, 'failed');
        assert.ok((mid.rawCaptureIds || []).length >= 1);
        assert.ok(!String(mid.failureMessage || '').includes('at '));
        await recalculateSearchQueryCaptureStats(companyA, campaignA._id, q._id, userId);

        const key3 = `fail-stats-${TAG}`;
        await assert.rejects(
            () => ingestRawCaptures({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: ingestBody({
                    queryId: String(q._id), idempotencyKey: key3,
                    records: [{ title: 'Stats', resultUrl: `https://fail3-${TAG.toLowerCase()}.example.com/` }],
                }),
                options: { failAfter: 'before_query_stats' },
            }),
            (e) => e.isTestHook,
        );
        const batch3 = await RawCaptureBatch.findOne({ companyId: companyA, idempotencyKey: key3 }).lean();
        assert.ok(['completed', 'partially_completed'].includes(batch3.status));
        await recalculateSearchQueryCaptureStats(companyA, campaignA._id, q._id, userId);
        const qDoc = await SearchQuery.findById(q._id).lean();
        assert.ok(qDoc.resultCount >= 1);
        assert.equal(qDoc.status, 'captured');

        const key4 = `fail-during-stats-${TAG}`;
        await assert.rejects(
            () => ingestRawCaptures({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: ingestBody({
                    queryId: String(q._id), idempotencyKey: key4,
                    records: [{ title: 'During', resultUrl: `https://fail4-${TAG.toLowerCase()}.example.com/` }],
                }),
                options: { failAfter: 'during_query_stats' },
            }),
            (e) => e.isTestHook,
        );
        const batch4 = await RawCaptureBatch.findOne({ companyId: companyA, idempotencyKey: key4 }).lean();
        assert.ok(['completed', 'partially_completed'].includes(batch4.status));
        assert.ok((batch4.rawCaptureIds || []).length >= 1);
        await recalculateSearchQueryCaptureStats(companyA, campaignA._id, q._id, userId);

        assert.equal(await ExtractedLead.countDocuments({}).catch(() => 0), leadsBefore);
        // same key different payload still conflicts
        await assert.rejects(
            () => ingestRawCaptures({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: ingestBody({
                    queryId: String(q._id), idempotencyKey: key3,
                    records: [{ title: 'Other', resultUrl: `https://other-${TAG.toLowerCase()}.example.com/` }],
                }),
            }),
            (e) => e.statusCode === 409,
        );
    });
});
