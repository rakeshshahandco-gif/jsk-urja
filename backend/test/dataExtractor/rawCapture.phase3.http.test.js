/**
 * Checkpoint 3A — focused RawCapture HTTP security / lifecycle tests.
 * Real protect + company scope + module gate + DE routes + errorHandler.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import dataExtractorRoute from '../../src/routes/v1/dataExtractor.routes.js';
import { resolveCompanyScope } from '../../src/middlewares/companyScope.middleware.js';
import { attachModuleContext, gateApiModuleByPath } from '../../src/middlewares/moduleGuard.middleware.js';
import { errorHandler } from '../../src/middlewares/error.middleware.js';
import { Company } from '../../src/models/company.model.js';
import { User } from '../../src/models/user.model.js';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { SearchQuery } from '../../src/models/searchQuery.model.js';
import { RawCapture } from '../../src/models/rawCapture.model.js';
import { RawCaptureBatch } from '../../src/models/rawCaptureBatch.model.js';
import { ExtractedLead } from '../../src/models/extractedLead.model.js';
import { Lead } from '../../src/models/lead.model.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `RC3A-HTTP-${Date.now()}`;
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';
const BASE = '/api/v1/data-extractor/search-campaigns';

let server; let baseUrl;
let companyA; let companyB;
let tokens = {};
let campaignAId; let campaignBId; let queryAId;
let seedRawId; let seedBatchId;
let leadsBefore; let crmLeadsBefore;
let keyCounter = 0;

function tokenFor(user) {
    return jwt.sign({ id: String(user._id), roleName: user.roleName }, JWT_SECRET, { expiresIn: '2h' });
}

function buildApp() {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use(resolveCompanyScope);
    app.use(attachModuleContext);
    app.use(gateApiModuleByPath);
    app.use('/api/v1/data-extractor', dataExtractorRoute);
    app.use(errorHandler);
    return app;
}

async function api(method, path, { token, companyId, body, query } = {}) {
    const url = new URL(path + (query || ''), baseUrl);
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (companyId) headers['X-Company-Id'] = String(companyId);
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, {
        method, headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { status: res.status, json, text };
}

function assertNoLeak(payload) {
    const s = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
    assert.doesNotMatch(s, /Cast to ObjectId failed|MongoServerError|E11000|mongodb:\/\/|\\\\node_modules\\\\|\/node_modules\//i);
    if (payload && typeof payload === 'object' && !payload.raw) {
        assert.equal(Object.prototype.hasOwnProperty.call(payload, 'stack'), false);
    }
}

function nextKey(prefix) {
    keyCounter += 1;
    return `${prefix}-${TAG}-${keyCounter}`;
}

function ingestPayload(overrides = {}) {
    return {
        source: 'google',
        captureMethod: 'api_batch',
        idempotencyKey: nextKey('k'),
        queryId: String(queryAId),
        records: [{ title: 'HTTP Co', resultUrl: `https://http-${TAG.toLowerCase()}-${keyCounter}.example.com/` }],
        ...overrides,
    };
}

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    assert.doesNotMatch(MONGO_URI, /prod|atlas|mongodb\.net/i);
    await mongoose.connect(MONGO_URI);
    leadsBefore = await ExtractedLead.countDocuments({}).catch(() => 0);
    crmLeadsBefore = await Lead.countDocuments({}).catch(() => 0);

    companyA = await Company.create({
        companyName: `RC3A A ${TAG}`, isActive: true, moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });
    companyB = await Company.create({
        companyName: `RC3A B ${TAG}`, isActive: true, moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });

    const mk = async (username, sc, sq, rc) => User.create({
        name: username,
        username: `${username}.${TAG}`.toLowerCase().replace(/[^a-z0-9.]/g, ''),
        email: `${username}.${TAG}@t.local`.toLowerCase(),
        password: 'TestPass123!',
        roleName: 'staff',
        allowLogin: true,
        isActive: true,
        companyAccessConfigured: false,
        additionalPermissions: {
            data_extractor: { search_campaign: sc, search_query: sq, raw_capture: rc },
        },
    });

    const view = { view: true, manage: false };
    const users = {
        full: await mk('full', view, { view: true, manage: false, generate: false, review: false, open: false }, {
            view: true, ingest: true, manage: true, archive: true,
        }),
        viewOnly: await mk('view', view, { view: true }, { view: true, ingest: false, manage: false, archive: false }),
        noRaw: await mk('noraw', view, { view: true }, { view: false, ingest: false, manage: false, archive: false }),
        ingestNoQueryView: await mk('inq', view, { view: false }, { view: true, ingest: true, manage: false, archive: false }),
        notesOnly: await mk('notes', view, { view: true }, { view: true, ingest: false, manage: true, archive: false }),
        archiveOnly: await mk('arch', view, { view: true }, { view: true, ingest: false, manage: false, archive: true }),
    };
    for (const [k, u] of Object.entries(users)) tokens[k] = tokenFor(u);

    const campA = await SearchCampaign.create({
        companyId: companyA._id, name: `RC3A Camp A ${TAG}`, nameNormalized: `rc3a camp a ${TAG}`,
        targetIndustry: 'Home Automation', country: 'India', sources: ['google'], status: 'active',
    });
    const campB = await SearchCampaign.create({
        companyId: companyB._id, name: `RC3A Camp B ${TAG}`, nameNormalized: `rc3a camp b ${TAG}`,
        targetIndustry: 'Other', country: 'India', sources: ['google'], status: 'active',
    });
    campaignAId = campA._id;
    campaignBId = campB._id;

    const q = await SearchQuery.create({
        companyId: companyA._id, campaignId: campaignAId,
        queryText: `http q ${TAG}`, queryNormalized: `http q ${TAG}`,
        sourceHint: 'google', status: 'approved', generationMethod: 'manual', queryType: 'manual',
        searchUrl: 'https://www.google.com/search?q=x',
    });
    queryAId = q._id;

    server = http.createServer(buildApp());
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise((r) => server.close(r));
    await RawCapture.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await RawCaptureBatch.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await SearchQuery.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await SearchCampaign.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) }, name: new RegExp(TAG) });
    await User.deleteMany({ email: new RegExp(TAG, 'i') });
    await Company.deleteMany({ companyName: new RegExp(TAG) });
    await mongoose.disconnect();
});

describe('CP3A HTTP — auth and permissions', () => {
    it('1. no authentication → 401', async () => {
        assert.equal((await api('GET', `${BASE}/${campaignAId}/raw-captures`, { companyId: companyA._id })).status, 401);
    });

    it('2. missing RawCapture view → 403', async () => {
        assert.equal((await api('GET', `${BASE}/${campaignAId}/raw-captures`, {
            token: tokens.noRaw, companyId: companyA._id,
        })).status, 403);
    });

    it('3. missing ingest permission → 403', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-captures/ingest`, {
            token: tokens.viewOnly, companyId: companyA._id,
            body: ingestPayload({ queryId: null }),
        })).status, 403);
    });

    it('4. query-linked ingest without SearchQuery view → 403', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-captures/ingest`, {
            token: tokens.ingestNoQueryView, companyId: companyA._id,
            body: ingestPayload(),
        })).status, 403);
    });
});

describe('CP3A HTTP — valid ingestion', () => {
    it('5. valid query-linked ingestion', async () => {
        const body = ingestPayload({
            captureMethod: 'assisted_visible',
            records: [
                { title: 'HTTP Co', resultUrl: `https://seed-${TAG.toLowerCase()}.example.com/?utm_source=g` },
                { title: '', resultUrl: 'javascript:alert(1)' },
            ],
        });
        const ingest = await api('POST', `${BASE}/${campaignAId}/raw-captures/ingest`, {
            token: tokens.full, companyId: companyA._id, body,
        });
        assert.equal(ingest.status, 201);
        assert.equal(ingest.json.data.status, 'partially_completed');
        assert.equal(ingest.json.data.idempotentReplay, false);
        assert.ok(ingest.json.data.requestFingerprint);
        assert.match(ingest.json.data.requestFingerprint, /^[a-f0-9]{64}$/);
        seedBatchId = ingest.json.data.batchId;
        seedRawId = ingest.json.data.rawCaptureIds[0];
        assertNoLeak(ingest.json);
    });

    it('6. valid campaign-level ingestion', async () => {
        const r = await api('POST', `${BASE}/${campaignAId}/raw-captures/ingest`, {
            token: tokens.full, companyId: companyA._id,
            body: ingestPayload({
                queryId: null,
                records: [{ title: 'Manual', resultUrl: `https://manual-${TAG.toLowerCase()}.example.com/` }],
            }),
        });
        assert.equal(r.status, 201);
        assert.equal(r.json.data.status, 'completed');
        assert.equal(r.json.data.queryStatus, null);
    });
});

describe('CP3A HTTP — company isolation and invalid IDs', () => {
    it('7. body companyId rejected', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-captures/ingest`, {
            token: tokens.full, companyId: companyA._id,
            body: ingestPayload({
                queryId: null,
                companyId: String(companyB._id),
                records: [{ title: 'x', resultUrl: `https://coid-${TAG.toLowerCase()}.example.com/` }],
            }),
        })).status, 400);
    });

    it('8. cross-company campaign → 404', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignBId}/raw-captures/ingest`, {
            token: tokens.full, companyId: companyA._id,
            body: ingestPayload({ queryId: null, records: [{ title: 'x', resultUrl: 'https://xb.example.com/' }] }),
        })).status, 404);
    });

    it('9. cross-company query → 404', async () => {
        const qB = await SearchQuery.create({
            companyId: companyB._id, campaignId: campaignBId,
            queryText: `qb ${TAG}`, queryNormalized: `qb ${TAG}`,
            sourceHint: 'google', status: 'approved', generationMethod: 'manual', queryType: 'manual',
            searchUrl: 'https://www.google.com/search?q=x',
        });
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-captures/ingest`, {
            token: tokens.full, companyId: companyA._id,
            body: ingestPayload({ queryId: String(qB._id) }),
        })).status, 404);
    });

    it('10. cross-company RawCapture detail → 404', async () => {
        const secret = await RawCapture.create({
            companyId: companyB._id, campaignId: campaignBId, queryScopeKey: 'campaign_manual',
            source: 'google', captureMethod: 'api_batch', captureFingerprint: `sec-${TAG}`,
            title: 'secret', titleNormalized: 'secret', inboxStatus: 'new',
        });
        assert.equal((await api('GET', `${BASE}/${campaignBId}/raw-captures/${secret._id}`, {
            token: tokens.viewOnly, companyId: companyA._id,
        })).status, 404);
    });

    it('11. cross-company batch detail → 404', async () => {
        const bBatch = await RawCaptureBatch.create({
            companyId: companyB._id, campaignId: campaignBId, source: 'google',
            captureMethod: 'api_batch', idempotencyKey: `bsecret-${TAG}`,
            requestFingerprint: 'a'.repeat(64), status: 'completed',
        });
        assert.equal((await api('GET', `${BASE}/${campaignBId}/raw-capture-batches/${bBatch._id}`, {
            token: tokens.viewOnly, companyId: companyA._id,
        })).status, 404);
    });

    it('12-15. invalid campaign/query/raw/batch IDs → 404', async () => {
        assert.equal((await api('GET', `${BASE}/not-an-id/raw-captures`, {
            token: tokens.viewOnly, companyId: companyA._id,
        })).status, 404);
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-captures/ingest`, {
            token: tokens.full, companyId: companyA._id,
            body: ingestPayload({ queryId: 'not-an-id' }),
        })).status, 404);
        assert.equal((await api('GET', `${BASE}/${campaignAId}/raw-captures/not-an-id`, {
            token: tokens.viewOnly, companyId: companyA._id,
        })).status, 404);
        assert.equal((await api('GET', `${BASE}/${campaignAId}/raw-capture-batches/not-an-id`, {
            token: tokens.viewOnly, companyId: companyA._id,
        })).status, 404);
    });
});

describe('CP3A HTTP — validation and pollution', () => {
    it('16. unknown top-level field rejected', async () => {
        const r = await api('POST', `${BASE}/${campaignAId}/raw-captures/ingest`, {
            token: tokens.full, companyId: companyA._id,
            body: ingestPayload({ queryId: null, extraTop: true, records: [{ title: 't', resultUrl: 'https://u16.example.com/' }] }),
        });
        assert.equal(r.status, 400);
        assertNoLeak(r.json);
    });

    it('17. unknown record field rejected', async () => {
        const r = await api('POST', `${BASE}/${campaignAId}/raw-captures/ingest`, {
            token: tokens.full, companyId: companyA._id,
            body: ingestPayload({
                queryId: null,
                records: [{ title: 't', resultUrl: 'https://u17.example.com/', html: '<b>x</b>' }],
            }),
        });
        // Unknown record fields are per-record validation errors (partial/failed batch), not a 400 body rejection.
        assert.equal(r.status, 201);
        assert.equal(r.json.data.status, 'failed');
        assert.equal(r.json.data.acceptedCount, 0);
        assert.ok((r.json.data.validationErrors || []).some((e) => /Unknown record fields/i.test(e.message)));
    });

    it('18. operator / prototype-pollution input rejected safely', async () => {
        const r = await api('GET', `${BASE}/${campaignAId}/raw-captures`, {
            token: tokens.viewOnly, companyId: companyA._id, query: '?$where=1',
        });
        assert.equal(r.status, 400);
        assertNoLeak(r.json);
    });

    it('19. oversized batch rejected', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-captures/ingest`, {
            token: tokens.full, companyId: companyA._id,
            body: ingestPayload({
                queryId: null,
                records: Array.from({ length: 101 }, (_, i) => ({
                    title: `t${i}`, resultUrl: `https://o${i}-${TAG.toLowerCase()}.example.com/`,
                })),
            }),
        })).status, 400);
    });
});

describe('CP3A HTTP — partial and invalid batches', () => {
    it('20. partial batch response', async () => {
        const r = await api('POST', `${BASE}/${campaignAId}/raw-captures/ingest`, {
            token: tokens.full, companyId: companyA._id,
            body: ingestPayload({
                queryId: null,
                records: [
                    { title: 'Ok', resultUrl: `https://partial-ok-${TAG.toLowerCase()}.example.com/` },
                    { title: '', resultUrl: 'javascript:bad' },
                ],
            }),
        });
        assert.equal(r.status, 201);
        assert.equal(r.json.data.status, 'partially_completed');
        assert.equal(r.json.data.acceptedCount, 1);
        assert.equal(r.json.data.rejectedCount, 1);
        assert.ok(r.json.data.validationErrors.length >= 1);
    });

    it('21. fully invalid batch response', async () => {
        const r = await api('POST', `${BASE}/${campaignAId}/raw-captures/ingest`, {
            token: tokens.full, companyId: companyA._id,
            body: ingestPayload({
                queryId: null,
                records: [{ title: '', resultUrl: 'javascript:bad' }],
            }),
        });
        assert.equal(r.status, 201);
        assert.equal(r.json.data.status, 'failed');
        assert.equal(r.json.data.acceptedCount, 0);
    });
});

describe('CP3A HTTP — idempotency', () => {
    it('22. same-key/same-payload replay → 200 idempotentReplay', async () => {
        const body = ingestPayload({
            queryId: null,
            records: [{ title: 'Replay', resultUrl: `https://replay-${TAG.toLowerCase()}.example.com/` }],
        });
        const first = await api('POST', `${BASE}/${campaignAId}/raw-captures/ingest`, {
            token: tokens.full, companyId: companyA._id, body,
        });
        assert.equal(first.status, 201);
        const second = await api('POST', `${BASE}/${campaignAId}/raw-captures/ingest`, {
            token: tokens.full, companyId: companyA._id, body,
        });
        assert.equal(second.status, 200);
        assert.equal(second.json.data.idempotentReplay, true);
        assert.equal(String(second.json.data.batchId), String(first.json.data.batchId));
    });

    it('23. same-key/different-payload conflict → 409 IDEMPOTENCY_KEY_REUSED', async () => {
        const key = nextKey('conflict');
        const first = await api('POST', `${BASE}/${campaignAId}/raw-captures/ingest`, {
            token: tokens.full, companyId: companyA._id,
            body: ingestPayload({
                queryId: null, idempotencyKey: key,
                records: [{ title: 'A', resultUrl: `https://conf-a-${TAG.toLowerCase()}.example.com/` }],
            }),
        });
        assert.equal(first.status, 201);
        const second = await api('POST', `${BASE}/${campaignAId}/raw-captures/ingest`, {
            token: tokens.full, companyId: companyA._id,
            body: ingestPayload({
                queryId: null, idempotencyKey: key,
                records: [{ title: 'B', resultUrl: `https://conf-b-${TAG.toLowerCase()}.example.com/` }],
            }),
        });
        assert.equal(second.status, 409);
        assert.equal(second.json.errorCode, 'IDEMPOTENCY_KEY_REUSED');
        assertNoLeak(second.json);
        assert.equal(second.json.data, undefined);
    });
});

describe('CP3A HTTP — notes and archive', () => {
    it('24. notes permission enforcement', async () => {
        assert.equal((await api('PATCH', `${BASE}/${campaignAId}/raw-captures/${seedRawId}/notes`, {
            token: tokens.viewOnly, companyId: companyA._id, body: { notes: 'n' },
        })).status, 403);
    });

    it('25. notes endpoint changes only notes', async () => {
        const before = await api('GET', `${BASE}/${campaignAId}/raw-captures/${seedRawId}`, {
            token: tokens.viewOnly, companyId: companyA._id,
        });
        const notes = await api('PATCH', `${BASE}/${campaignAId}/raw-captures/${seedRawId}/notes`, {
            token: tokens.notesOnly, companyId: companyA._id, body: { notes: 'ok notes' },
        });
        assert.equal(notes.status, 200);
        assert.equal(notes.json.data.rawCapture.notes, 'ok notes');
        assert.equal(notes.json.data.rawCapture.inboxStatus, before.json.data.rawCapture.inboxStatus);
        assert.equal(notes.json.data.rawCapture.title, before.json.data.rawCapture.title);
        assert.equal(notes.json.data.rawCapture.seenCount, before.json.data.rawCapture.seenCount);
    });

    it('26. archive permission enforcement', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-captures/${seedRawId}/archive`, {
            token: tokens.viewOnly, companyId: companyA._id, body: {},
        })).status, 403);
    });

    it('27. archive succeeds and preserves evidence', async () => {
        const arch = await api('POST', `${BASE}/${campaignAId}/raw-captures/${seedRawId}/archive`, {
            token: tokens.archiveOnly, companyId: companyA._id, body: {},
        });
        assert.equal(arch.status, 200);
        assert.equal(arch.json.data.rawCapture.inboxStatus, 'archived');
        assert.ok(arch.json.data.rawCapture.title);
        const still = await RawCapture.findById(seedRawId).lean();
        assert.ok(still);
        assert.equal(still.inboxStatus, 'archived');
    });

    it('28. archived excluded by default', async () => {
        const list = await api('GET', `${BASE}/${campaignAId}/raw-captures`, {
            token: tokens.viewOnly, companyId: companyA._id,
        });
        assert.equal(list.status, 200);
        assert.ok(!list.json.data.items.some((i) => String(i._id) === String(seedRawId)));
    });
});

describe('CP3A HTTP — route and side-effect safety', () => {
    it('29. DELETE route absent', async () => {
        assert.ok([404, 405].includes((await api('DELETE', `${BASE}/${campaignAId}/raw-captures/${seedRawId}`, {
            token: tokens.full, companyId: companyA._id,
        })).status));
    });

    it('30. no stack trace or raw MongoDB error', async () => {
        const r = await api('GET', `${BASE}/${campaignAId}/raw-captures/${new mongoose.Types.ObjectId()}`, {
            token: tokens.viewOnly, companyId: companyA._id,
        });
        assert.equal(r.status, 404);
        assertNoLeak(r.json);
        assertNoLeak(r.text);
    });

    it('31. no ExtractedLead or CRM Lead side effect', async () => {
        assert.equal(await ExtractedLead.countDocuments({}).catch(() => 0), leadsBefore);
        assert.equal(await Lead.countDocuments({}).catch(() => 0), crmLeadsBefore);
        assert.equal((await api('GET', `${BASE}/${campaignAId}/raw-capture-batches/${seedBatchId}`, {
            token: tokens.viewOnly, companyId: companyA._id,
        })).status, 200);
    });
});
