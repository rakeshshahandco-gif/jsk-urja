/**
 * Checkpoint 3 — RawCapture ingestion / inbox service tests (crm_test only).
 * No enrichment, AI, CRM promotion, or browser automation.
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
    rawCaptureHardDeleteSupported,
} from '../../src/services/dataExtractor/searchCampaign/rawCapture/rawCapture.ingestion.service.js';
import {
    archiveRawCapture,
    getRawCapture,
    listRawCaptures,
    updateRawCaptureNotes,
} from '../../src/services/dataExtractor/searchCampaign/rawCapture/rawCapture.inbox.service.js';
import { openSearchQuery } from '../../src/services/dataExtractor/searchCampaign/searchQuery/searchQuery.service.js';
import {
    normalizeResultUrl,
    buildCaptureFingerprint,
} from '../../src/services/dataExtractor/searchCampaign/rawCapture/normalize.util.js';
import {
    RAW_CAPTURE_IDENTITY_INDEX_NAME,
    RAW_CAPTURE_BATCH_IDEMPOTENCY_INDEX_NAME,
} from '../../src/services/dataExtractor/searchCampaign/rawCapture/constants.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `RC3-${Date.now()}`;
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
            search_query: { view: true, manage: true, generate: true, review: true, open: true },
            raw_capture: { view: true, ingest: true, manage: true, archive: true },
        },
    },
};

let campaignA;
let campaignB;
let closedCamp;
let archivedCamp;
let pausedCamp;
let queryApproved;
let queryOpened;
let queryCaptured;
let queryDraft;
let queryGenerated;
let queryRejected;
let queryArchived;
let queryOtherCampaign;
let leadsBefore;

async function makeQuery(overrides = {}) {
    return SearchQuery.create({
        companyId: companyA,
        campaignId: campaignA._id,
        queryText: `q ${TAG} ${Math.random().toString(36).slice(2, 8)}`,
        queryNormalized: `q ${TAG} ${Math.random().toString(36).slice(2, 8)}`,
        sourceHint: 'google',
        queryType: 'manual',
        status: 'approved',
        generationMethod: 'manual',
        searchUrl: 'https://www.google.com/search?q=test',
        createdBy: userId,
        updatedBy: userId,
        ...overrides,
    });
}

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    assert.doesNotMatch(MONGO_URI, /prod|atlas|mongodb\.net/i);
    await mongoose.connect(MONGO_URI);
    await RawCapture.syncIndexes();
    await RawCaptureBatch.syncIndexes();

    campaignA = await SearchCampaign.create({
        companyId: companyA, name: `RC A ${TAG}`, nameNormalized: `rc a ${TAG}`,
        targetIndustry: 'Home Automation', country: 'India', sources: ['google'], status: 'active',
    });
    campaignB = await SearchCampaign.create({
        companyId: companyB, name: `RC B ${TAG}`, nameNormalized: `rc b ${TAG}`,
        targetIndustry: 'Other', country: 'India', sources: ['google'], status: 'active',
    });
    closedCamp = await SearchCampaign.create({
        companyId: companyA, name: `RC Closed ${TAG}`, nameNormalized: `rc closed ${TAG}`,
        targetIndustry: 'X', status: 'closed',
    });
    archivedCamp = await SearchCampaign.create({
        companyId: companyA, name: `RC Arch ${TAG}`, nameNormalized: `rc arch ${TAG}`,
        targetIndustry: 'X', status: 'archived',
    });
    pausedCamp = await SearchCampaign.create({
        companyId: companyA, name: `RC Pause ${TAG}`, nameNormalized: `rc pause ${TAG}`,
        targetIndustry: 'X', status: 'paused',
    });

    queryApproved = await makeQuery({ status: 'approved' });
    queryOpened = await makeQuery({ status: 'opened' });
    queryCaptured = await makeQuery({ status: 'captured' });
    queryDraft = await makeQuery({ status: 'draft' });
    queryGenerated = await makeQuery({ status: 'generated' });
    queryRejected = await makeQuery({ status: 'rejected' });
    queryArchived = await makeQuery({ status: 'archived' });
    const camp2 = await SearchCampaign.create({
        companyId: companyA, name: `RC A2 ${TAG}`, nameNormalized: `rc a2 ${TAG}`,
        targetIndustry: 'Y', status: 'active',
    });
    queryOtherCampaign = await makeQuery({ campaignId: camp2._id, status: 'approved' });

    leadsBefore = await ExtractedLead.countDocuments({}).catch(() => 0);
});

after(async () => {
    await RawCapture.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await RawCaptureBatch.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await SearchQuery.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await SearchCampaign.deleteMany({ companyId: { $in: [companyA, companyB] }, name: new RegExp(TAG) });
    await mongoose.disconnect();
});

function baseIngest(overrides = {}) {
    return {
        source: 'google',
        captureMethod: 'api_batch',
        idempotencyKey: `key-${TAG}-${Math.random().toString(36).slice(2)}`,
        queryId: String(queryApproved._id),
        records: [{
            title: 'Example Automation Company',
            snippet: 'Smart home solutions',
            resultUrl: 'https://example.com/page?utm_source=google&gclid=abc#frag',
            resultPosition: 1,
            resultTypeHint: 'company',
        }],
        ...overrides,
    };
}

describe('RawCapture indexes', () => {
    it('creates identity and idempotency unique indexes', async () => {
        const rcIdx = await RawCapture.collection.indexes();
        const batchIdx = await RawCaptureBatch.collection.indexes();
        assert.ok(rcIdx.find((i) => i.name === RAW_CAPTURE_IDENTITY_INDEX_NAME)?.unique);
        assert.ok(batchIdx.find((i) => i.name === RAW_CAPTURE_BATCH_IDEMPOTENCY_INDEX_NAME)?.unique);
    });
});

describe('RawCapture normalization', () => {
    it('strips tracking params/fragment and derives domain; rejects bad URLs', () => {
        const n = normalizeResultUrl('https://WWW.Example.com/path?utm_source=g&gclid=1&keep=1#x');
        assert.equal(n.normalized, 'https://www.example.com/path?keep=1');
        assert.equal(n.displayDomain, 'example.com');
        assert.ok(n.original.includes('utm_source'));
        assert.throws(() => normalizeResultUrl('javascript:alert(1)'));
        assert.throws(() => normalizeResultUrl('https://user:pass@example.com/'));
        assert.throws(() => normalizeResultUrl('http://127.0.0.1/x'));
        assert.throws(() => normalizeResultUrl('http://localhost/x'));
        assert.throws(() => normalizeResultUrl('http://192.168.1.1/x'));
        assert.ok(buildCaptureFingerprint({
            source: 'google', queryScopeKey: 'q1', resultUrlNormalized: n.normalized,
        }).length === 64);
    });
});

describe('RawCapture ingestion eligibility', () => {
    it('accepts approved/opened/captured; rejects draft/generated/rejected/archived', async () => {
        for (const q of [queryApproved, queryOpened, queryCaptured]) {
            const r = await ingestRawCaptures({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: baseIngest({
                    queryId: String(q._id),
                    idempotencyKey: `ok-${q.status}-${TAG}`,
                    records: [{ title: `T ${q.status}`, resultUrl: `https://ok-${q.status}.example.com/` }],
                }),
            });
            assert.ok(['completed', 'partially_completed'].includes(r.status));
        }
        for (const q of [queryDraft, queryGenerated, queryRejected, queryArchived]) {
            await assert.rejects(
                () => ingestRawCaptures({
                    companyId: companyA, user: fullUser, campaignId: campaignA._id,
                    body: baseIngest({ queryId: String(q._id), idempotencyKey: `bad-${q.status}-${TAG}` }),
                }),
                (e) => e.statusCode === 400,
            );
        }
    });

    it('rejects closed/archived campaigns; allows paused; rejects cross-company and wrong-campaign query', async () => {
        await assert.rejects(() => ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: closedCamp._id,
            body: baseIngest({ queryId: null, idempotencyKey: `closed-${TAG}` }),
        }), (e) => e.statusCode === 400);
        await assert.rejects(() => ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: archivedCamp._id,
            body: baseIngest({ queryId: null, idempotencyKey: `archcamp-${TAG}` }),
        }), (e) => e.statusCode === 400);

        const paused = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: pausedCamp._id,
            body: baseIngest({
                queryId: null,
                idempotencyKey: `paused-${TAG}`,
                records: [{ title: 'Paused OK', resultUrl: 'https://paused.example.com/' }],
            }),
        });
        assert.equal(paused.status, 'completed');

        await assert.rejects(() => ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignB._id,
            body: baseIngest({ queryId: null, idempotencyKey: `xco-${TAG}` }),
        }), (e) => e.statusCode === 404);

        await assert.rejects(() => ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: baseIngest({ queryId: String(queryOtherCampaign._id), idempotencyKey: `xcamp-${TAG}` }),
        }), (e) => e.statusCode === 404);
    });

    it('rejects companyId/audit/unknown fields and enforces batch max', async () => {
        await assert.rejects(() => ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: { ...baseIngest(), companyId: String(companyB) },
        }), (e) => e.statusCode === 400);
        await assert.rejects(() => ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: { ...baseIngest(), createdBy: String(userId) },
        }), (e) => e.statusCode === 400);
        await assert.rejects(() => ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: { ...baseIngest(), unexpected: true },
        }), (e) => e.statusCode === 400);
        await assert.rejects(() => ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: baseIngest({
                idempotencyKey: `big-${TAG}`,
                records: Array.from({ length: 101 }, (_, i) => ({ title: `t${i}`, resultUrl: `https://x${i}.example.com/` })),
            }),
        }), (e) => e.statusCode === 400);
    });
});

describe('RawCapture ingest behavior', () => {
    it('ingests query-linked and campaign-level; partial batch; idempotent replay; counters', async () => {
        const counterQuery = await makeQuery({ status: 'approved', queryText: `counter ${TAG}`, queryNormalized: `counter ${TAG}` });
        const key = `main-${TAG}`;
        const r1 = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: baseIngest({
                idempotencyKey: key,
                queryId: String(counterQuery._id),
                records: [
                    { title: 'Good Co', resultUrl: 'https://good.example.com/?utm_medium=cpc' },
                    { title: '', snippet: '', resultUrl: '' },
                    { title: 'Bad proto', resultUrl: 'ftp://files.example.com/x' },
                ],
            }),
        });
        assert.equal(r1.status, 'partially_completed');
        assert.equal(r1.insertedCount, 1);
        assert.equal(r1.rejectedCount, 2);
        assert.equal(r1.idempotentReplay, false);
        assert.ok(r1.validationErrors.length >= 2);
        assert.equal(r1.queryStatus, 'captured');
        assert.equal(r1.queryResultCount, 1);
        assert.equal(r1.queryCaptureCount, 1);

        const replay = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: baseIngest({
                idempotencyKey: key,
                queryId: String(counterQuery._id),
                records: [
                    { title: 'Good Co', resultUrl: 'https://good.example.com/?utm_medium=cpc' },
                    { title: '', snippet: '', resultUrl: '' },
                    { title: 'Bad proto', resultUrl: 'ftp://files.example.com/x' },
                ],
            }),
        });
        assert.equal(replay.idempotentReplay, true);
        assert.equal(String(replay.batchId), String(r1.batchId));
        assert.equal(replay.queryCaptureCount, 1);

        await assert.rejects(
            () => ingestRawCaptures({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: baseIngest({
                    idempotencyKey: key,
                    queryId: String(counterQuery._id),
                    records: [{ title: 'Good Co', resultUrl: 'https://good.example.com/' }],
                }),
            }),
            (e) => e.statusCode === 409 && e.errorCode === 'IDEMPOTENCY_KEY_REUSED',
        );

        const r2 = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: baseIngest({
                idempotencyKey: `main2-${TAG}`,
                queryId: String(counterQuery._id),
                records: [{ title: 'Good Co Updated', resultUrl: 'https://good.example.com/?utm_source=x' }],
            }),
        });
        assert.equal(r2.updatedExistingCount, 1);
        assert.equal(r2.insertedCount, 0);
        assert.equal(r2.queryCaptureCount, 2);
        assert.equal(r2.queryResultCount, 1);

        const cap = await RawCapture.findById(r1.rawCaptureIds[0]).lean();
        assert.equal(cap.seenCount, 2);
        assert.ok(cap.firstSeenAt);
        assert.equal(cap.resultUrlNormalized, 'https://good.example.com/');
        assert.ok(cap.resultUrlOriginal.includes('utm_'));
        assert.equal(cap.displayDomain, 'good.example.com');
        assert.equal(cap.inboxStatus, 'new');

        const manual = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: baseIngest({
                queryId: null,
                idempotencyKey: `manual-${TAG}`,
                records: [{ title: 'Manual URL', resultUrl: 'https://manual.example.com/' }],
            }),
        });
        assert.equal(manual.status, 'completed');
        const manualDoc = await RawCapture.findById(manual.rawCaptureIds[0]).lean();
        assert.equal(manualDoc.queryScopeKey, 'campaign_manual');
        assert.equal(manualDoc.queryId, null);
    });

    it('same URL under different query/campaign/company creates separate rows; archived stays archived', async () => {
        const url = 'https://shared-result.example.com/page';
        const a = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: baseIngest({
                queryId: String(queryOpened._id),
                idempotencyKey: `share-a-${TAG}`,
                records: [{ title: 'Shared', resultUrl: url }],
            }),
        });
        const b = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: baseIngest({
                queryId: String(queryCaptured._id),
                idempotencyKey: `share-b-${TAG}`,
                records: [{ title: 'Shared', resultUrl: url }],
            }),
        });
        assert.notEqual(String(a.rawCaptureIds[0]), String(b.rawCaptureIds[0]));

        await archiveRawCapture({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            rawCaptureId: a.rawCaptureIds[0],
        });
        const again = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: baseIngest({
                queryId: String(queryOpened._id),
                idempotencyKey: `share-a2-${TAG}`,
                records: [{ title: 'Shared again', resultUrl: url }],
            }),
        });
        assert.equal(again.updatedExistingCount, 1);
        const archived = await getRawCapture({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            rawCaptureId: a.rawCaptureIds[0],
        });
        assert.equal(archived.inboxStatus, 'archived');
        assert.ok(archived.seenCount >= 2);

        // resultCount includes archived
        const q = await SearchQuery.findById(queryOpened._id).lean();
        assert.ok(q.resultCount >= 1);

        const campLevel = await ingestRawCaptures({
            companyId: companyA, user: fullUser, campaignId: pausedCamp._id,
            body: baseIngest({
                queryId: null,
                idempotencyKey: `share-camp-${TAG}`,
                records: [{ title: 'Shared', resultUrl: url }],
            }),
        });
        assert.equal(campLevel.insertedCount, 1);
    });

    it('concurrency: same idempotency key and parallel duplicate upserts', async () => {
        const key = `conc-${TAG}`;
        const body = baseIngest({
            idempotencyKey: key,
            queryId: String(queryCaptured._id),
            records: [{ title: 'Conc Co', resultUrl: `https://conc-${TAG}.example.com/` }],
        });
        const [x, y] = await Promise.all([
            ingestRawCaptures({ companyId: companyA, user: fullUser, campaignId: campaignA._id, body }),
            ingestRawCaptures({ companyId: companyA, user: fullUser, campaignId: campaignA._id, body: { ...body } }),
        ]);
        assert.equal(String(x.batchId), String(y.batchId));
        assert.ok(x.idempotentReplay || y.idempotentReplay);
        const batches = await RawCaptureBatch.countDocuments({ companyId: companyA, idempotencyKey: key });
        assert.equal(batches, 1);

        const url = `https://race-${String(TAG).toLowerCase()}.example.com/`;
        const raceQuery = await makeQuery({ status: 'captured', queryText: `race ${TAG}`, queryNormalized: `race ${TAG}` });
        const [p1, p2] = await Promise.all([
            ingestRawCaptures({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: baseIngest({
                    idempotencyKey: `race1-${TAG}`,
                    queryId: String(raceQuery._id),
                    records: [{ title: 'Race', resultUrl: url }],
                }),
            }),
            ingestRawCaptures({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: baseIngest({
                    idempotencyKey: `race2-${TAG}`,
                    queryId: String(raceQuery._id),
                    records: [{ title: 'Race', resultUrl: url }],
                }),
            }),
        ]);
        assert.ok(p1.acceptedCount + p2.acceptedCount >= 1);
        const rows = await RawCapture.countDocuments({
            companyId: companyA,
            campaignId: campaignA._id,
            queryId: raceQuery._id,
            resultUrlNormalized: url,
        });
        assert.equal(rows, 1);
    });

    it('captured query can still be opened; notes/archive/list; no ExtractedLead; no hard delete', async () => {
        const opened = await openSearchQuery({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, queryId: queryApproved._id,
        });
        assert.equal(opened.query.status, 'captured');
        assert.ok(opened.openedCount >= 1);

        const list = await listRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, query: { limit: 50 },
        });
        assert.ok(list.items.every((i) => i.inboxStatus !== 'archived'));
        const id = list.items[0]._id;
        const noted = await updateRawCaptureNotes({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, rawCaptureId: id,
            body: { notes: 'reviewed' },
        });
        assert.equal(noted.notes, 'reviewed');
        await assert.rejects(() => updateRawCaptureNotes({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, rawCaptureId: id,
            body: { notes: 'x', title: 'hack' },
        }), (e) => e.statusCode === 400);

        await assert.rejects(() => listRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, query: { $where: '1' },
        }), (e) => e.statusCode === 400);
        await assert.rejects(() => listRawCaptures({
            companyId: companyA, user: fullUser, campaignId: campaignA._id, query: { limit: 101 },
        }), (e) => e.statusCode === 400);

        assert.equal(rawCaptureHardDeleteSupported(), false);
        const leadsAfter = await ExtractedLead.countDocuments({}).catch(() => 0);
        assert.equal(leadsAfter, leadsBefore);

        const batchDoc = await RawCaptureBatch.findOne({ companyId: companyA }).lean();
        assert.equal(Object.prototype.hasOwnProperty.call(batchDoc, 'rawPayload'), false);
        assert.ok((batchDoc.validationErrors || []).length <= 25);
    });
});
