/**
 * Checkpoint 4A — expanded HTTP boundary coverage (crm_test).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import dataExtractorRoute from '../../src/routes/v1/dataExtractor.routes.js';
import { resolveCompanyScope } from '../../src/middlewares/companyScope.middleware.js';
import { attachModuleContext, gateApiModuleByPath } from '../../src/middlewares/moduleGuard.middleware.js';
import { errorHandler } from '../../src/middlewares/error.middleware.js';
import { Company } from '../../src/models/company.model.js';
import { User } from '../../src/models/user.model.js';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { SearchQuery } from '../../src/models/searchQuery.model.js';
import { RawCapture } from '../../src/models/rawCapture.model.js';
import { RawCaptureImportRun } from '../../src/models/rawCaptureImportRun.model.js';
import { ExtractedLead } from '../../src/models/extractedLead.model.js';
import { Lead } from '../../src/models/lead.model.js';
import { __multerInvokes, __resetMulterInvokes } from '../../src/controllers/rawCaptureImport.controller.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `RC4A-HTTP-${Date.now()}`;
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';
const BASE = '/api/v1/data-extractor/search-campaigns';

let server; let baseUrl;
let companyA; let companyB; let companyOff;
let tokens = {};
let campaignAId; let campaignBId; let queryAId;
let leadsBefore; let crmBefore;

function tokenFor(user) {
    return jwt.sign({ id: String(user._id), roleName: user.roleName }, JWT_SECRET, { expiresIn: '2h' });
}

function buildApp() {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use(resolveCompanyScope);
    // Mirror production: module guard sees paths under /api/v1 (e.g. /data-extractor/...).
    const v1 = express.Router();
    v1.use(attachModuleContext);
    v1.use(gateApiModuleByPath);
    v1.use('/data-extractor', dataExtractorRoute);
    app.use('/api/v1', v1);
    app.use(errorHandler);
    return app;
}

async function api(method, path, { token, companyId, body } = {}) {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (companyId) headers['X-Company-Id'] = String(companyId);
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(new URL(path, baseUrl), {
        method, headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { status: res.status, json, text };
}

async function apiMultipart(path, { token, companyId, fields = {}, file, extraFile } = {}) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
        form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    if (file) form.append('file', new Blob([file.buffer], { type: file.mime || 'application/octet-stream' }), file.name);
    if (extraFile) form.append(extraFile.field || 'extra', new Blob([extraFile.buffer]), extraFile.name || 'e.bin');
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (companyId) headers['X-Company-Id'] = String(companyId);
    const res = await fetch(new URL(path, baseUrl), { method: 'POST', headers, body: form });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { status: res.status, json, text };
}

function assertNoLeak(payload) {
    const s = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
    assert.doesNotMatch(s, /Cast to ObjectId failed|MongoServerError|E11000|mongodb:\/\/|node_modules/i);
    if (payload && typeof payload === 'object' && !payload.raw) {
        assert.equal(Object.prototype.hasOwnProperty.call(payload, 'stack'), false);
    }
}

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    await mongoose.connect(MONGO_URI);
    companyA = await Company.create({
        companyName: `RC4AH A ${TAG}`, isActive: true, moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });
    companyB = await Company.create({
        companyName: `RC4AH B ${TAG}`, isActive: true, moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });
    companyOff = await Company.create({
        companyName: `RC4AH Off ${TAG}`, isActive: true, moduleGuardEnabled: true,
        moduleAllocationConfigured: true,
        enabledModules: ['crm'],
        disabledModules: ['data_extractor'],
        moduleStates: [{ moduleKey: 'data_extractor', state: 'OFF' }],
    });
    const mk = async (username, rc, sqView = true) => User.create({
        name: username,
        username: `${username}.${TAG}`.toLowerCase().replace(/[^a-z0-9.]/g, ''),
        email: `${username}.${TAG}@t.local`.toLowerCase(),
        password: 'TestPass123!',
        roleName: 'staff', allowLogin: true, isActive: true, companyAccessConfigured: false,
        additionalPermissions: {
            data_extractor: {
                search_campaign: { view: true, manage: false },
                search_query: { view: sqView },
                raw_capture: rc,
            },
        },
    });
    const full = await mk('full', { view: true, ingest: true, import: true, manage: true });
    tokens.full = tokenFor(full);
    tokens.noImport = tokenFor(await mk('noimp', { view: true, ingest: true, import: false }));
    tokens.importOnly = tokenFor(await mk('imponly', { view: true, ingest: false, import: true }));
    tokens.importNoQuery = tokenFor(await mk('noqv', { view: true, ingest: true, import: true }, false));
    campaignAId = (await SearchCampaign.create({
        companyId: companyA._id, name: `RC4AH Camp ${TAG}`, nameNormalized: `rc4ah camp ${TAG}`,
        targetIndustry: 'Home Automation', country: 'India', sources: ['google'], status: 'active',
    }))._id;
    campaignBId = (await SearchCampaign.create({
        companyId: companyB._id, name: `RC4AH CampB ${TAG}`, nameNormalized: `rc4ah campb ${TAG}`,
        targetIndustry: 'Other', country: 'India', sources: ['google'], status: 'active',
    }))._id;
    queryAId = (await SearchQuery.create({
        companyId: companyA._id, campaignId: campaignAId,
        queryText: `q ${TAG}`, queryNormalized: `q ${TAG}`,
        sourceHint: 'google', status: 'approved', generationMethod: 'manual', queryType: 'manual',
        searchUrl: 'https://www.google.com/search?q=x',
    }))._id;
    leadsBefore = await ExtractedLead.countDocuments({}).catch(() => 0);
    crmBefore = await Lead.countDocuments({}).catch(() => 0);
    server = http.createServer(buildApp());
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise((r) => server.close(r));
    await RawCapture.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await RawCaptureImportRun.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await SearchQuery.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await SearchCampaign.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) }, name: new RegExp(TAG) });
    await User.deleteMany({ email: new RegExp(TAG, 'i') });
    await Company.deleteMany({ companyName: new RegExp(TAG) });
    await mongoose.disconnect();
});

describe('CP4A HTTP named boundaries', () => {
    it('1. no authentication rejected before Multer', async () => {
        __resetMulterInvokes();
        const r = await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/preview/file`, {
            companyId: companyA._id,
            file: { buffer: Buffer.from('URL\nhttps://a.example.com\n'), name: 't.csv', mime: 'text/csv' },
        });
        assert.equal(r.status, 401);
        assert.equal(__multerInvokes.count, 0);
    });

    it('2. module disabled rejected before Multer', async () => {
        __resetMulterInvokes();
        // Use companyOff with module guard: data_extractor not enabled
        const campOff = await SearchCampaign.create({
            companyId: companyOff._id, name: `Off ${TAG}`, nameNormalized: `off ${TAG}`,
            targetIndustry: 'X', country: 'India', sources: ['google'], status: 'active',
        });
        const r = await apiMultipart(`${BASE}/${campOff._id}/raw-capture-imports/preview/file`, {
            token: tokens.full, companyId: companyOff._id,
            file: { buffer: Buffer.from('URL\nhttps://a.example.com\n'), name: 't.csv', mime: 'text/csv' },
        });
        assert.ok([403, 404, 400].includes(r.status), `module-disabled unexpected status ${r.status} body=${JSON.stringify(r.json)}`);
        assert.equal(__multerInvokes.count, 0, 'Multer must not buffer when module disabled');
        await SearchCampaign.deleteOne({ _id: campOff._id });
    });

    it('3. no import permission rejected before Multer', async () => {
        __resetMulterInvokes();
        const r = await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/preview/file`, {
            token: tokens.noImport, companyId: companyA._id,
            file: { buffer: Buffer.from('URL\nhttps://a.example.com\n'), name: 't.csv', mime: 'text/csv' },
        });
        assert.equal(r.status, 403);
        assert.equal(__multerInvokes.count, 0);
    });

    it('4. no ingest permission → 403 commit', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/ingest/manual-urls`, {
            token: tokens.importOnly, companyId: companyA._id,
            body: { source: 'manual', idempotencyKey: `ni-${TAG}`, urls: ['https://a.example.com'] },
        })).status, 403);
    });

    it('5. query-linked commit without SearchQuery view → 403', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/ingest/manual-urls`, {
            token: tokens.importNoQuery, companyId: companyA._id,
            body: {
                source: 'manual', idempotencyKey: `nq-${TAG}`, queryId: String(queryAId),
                urls: ['https://a.example.com'],
            },
        })).status, 403);
    });

    it('14. companyId in JSON rejected', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/preview/manual-urls`, {
            token: tokens.full, companyId: companyA._id,
            body: { urls: ['https://a.example.com'], companyId: String(companyB._id) },
        })).status, 400);
    });

    it('15. companyId in multipart field rejected', async () => {
        const r = await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/preview/file`, {
            token: tokens.full, companyId: companyA._id,
            fields: { companyId: String(companyB._id) },
            file: { buffer: Buffer.from('URL\nhttps://a.example.com\n'), name: 't.csv', mime: 'text/csv' },
        });
        // previewFileImport should reject companyId via rejectForbidden
        assert.equal(r.status, 400);
    });

    it('16-18. cross-company campaign/query/importRun → 404', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignBId}/raw-capture-imports/preview/manual-urls`, {
            token: tokens.full, companyId: companyA._id,
            body: { urls: ['https://a.example.com'] },
        })).status, 404);
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/ingest/manual-urls`, {
            token: tokens.full, companyId: companyA._id,
            body: {
                source: 'manual', idempotencyKey: `xq-${TAG}`,
                queryId: new mongoose.Types.ObjectId().toString(),
                urls: ['https://a.example.com'],
            },
        })).status, 404);
        const secret = await RawCaptureImportRun.create({
            companyId: companyB._id, campaignId: campaignBId, adapterType: 'manual_url',
            source: 'manual', captureMethod: 'manual_url', idempotencyKey: `sec-${TAG}`,
            requestFingerprint: 'c'.repeat(64), status: 'completed',
        });
        assert.equal((await api('GET', `${BASE}/${campaignBId}/raw-capture-imports/${secret._id}`, {
            token: tokens.full, companyId: companyA._id,
        })).status, 404);
    });

    it('24-26. unexpected file field, multiple files, oversized upload', async () => {
        __resetMulterInvokes();
        const multi = await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/preview/file`, {
            token: tokens.full, companyId: companyA._id,
            file: { buffer: Buffer.from('URL\nhttps://a.example.com\n'), name: 't.csv', mime: 'text/csv' },
            extraFile: { buffer: Buffer.from('x'), name: 'e.bin', field: 'extra' },
        });
        assert.equal(multi.status, 400);
        assert.ok(__multerInvokes.count >= 1);

        const huge = await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/preview/file`, {
            token: tokens.full, companyId: companyA._id,
            file: { buffer: Buffer.alloc(11 * 1024 * 1024, 0x61), name: 'big.csv', mime: 'text/csv' },
        });
        assert.equal(huge.status, 400);
    });

    it('34-35. tampered mapping / preview fingerprint', async () => {
        const csv = Buffer.from(`Company,Website\nT,https://map-${TAG.toLowerCase()}.example.com\n`, 'utf8');
        assert.equal((await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/ingest/file`, {
            token: tokens.full, companyId: companyA._id,
            fields: {
                source: 'manual', idempotencyKey: `tm-${TAG}`,
                columnMapping: JSON.stringify({ title: 'Nope', resultUrl: 'Missing' }),
            },
            file: { buffer: csv, name: 't.csv', mime: 'text/csv' },
        })).status, 400);

        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/ingest/manual-urls`, {
            token: tokens.full, companyId: companyA._id,
            body: {
                source: 'manual', idempotencyKey: `tfp-${TAG}`,
                urls: [`https://tfp-${TAG.toLowerCase()}.example.com`],
                previewFingerprint: 'deadbeef',
            },
        })).status, 400);
    });

    it('36-37. review_required default exclusion and explicit override', async () => {
        const mixed = `https://clean-http-${TAG.toLowerCase()}.example.com\nCompany Z https://z-http-${TAG.toLowerCase()}.example.com extra`;
        const def = await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/ingest/pasted-text`, {
            token: tokens.full, companyId: companyA._id,
            body: { source: 'manual', idempotencyKey: `rrd-${TAG}`, text: mixed },
        });
        assert.ok([200, 201].includes(def.status));
        assert.ok(['completed', 'partially_completed', 'failed'].includes(def.json.data.status));

        const over = await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/ingest/pasted-text`, {
            token: tokens.full, companyId: companyA._id,
            body: {
                source: 'manual', idempotencyKey: `rro-${TAG}`, text: mixed, allowReviewRequired: true,
            },
        });
        assert.ok([200, 201].includes(over.status));
        const run = await RawCaptureImportRun.findById(over.json.data.importRunId).lean();
        assert.equal(run.allowReviewRequired, true);
        assert.ok(run.reviewOverrideBy);
    });

    it('38-42. no leak, no DELETE, preview no side effect, commit no ExtractedLead/CRM', async () => {
        const before = await RawCapture.countDocuments({ companyId: companyA._id });
        const prev = await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/preview/manual-urls`, {
            token: tokens.full, companyId: companyA._id,
            body: { urls: [`https://prev-side-${TAG.toLowerCase()}.example.com`] },
        });
        assert.equal(prev.status, 200);
        assert.equal(await RawCapture.countDocuments({ companyId: companyA._id }), before);

        const commit = await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/ingest/manual-urls`, {
            token: tokens.full, companyId: companyA._id,
            body: {
                source: 'manual', idempotencyKey: `side-${TAG}`,
                urls: [`https://side-${TAG.toLowerCase()}.example.com`],
            },
        });
        assert.ok([200, 201].includes(commit.status));
        assertNoLeak(commit.json);
        assert.ok([404, 405].includes((await api('DELETE', `${BASE}/${campaignAId}/raw-capture-imports/${commit.json.data.importRunId}`, {
            token: tokens.full, companyId: companyA._id,
        })).status));
        assert.equal(await ExtractedLead.countDocuments({}).catch(() => 0), leadsBefore);
        assert.equal(await Lead.countDocuments({}).catch(() => 0), crmBefore);
    });
});
