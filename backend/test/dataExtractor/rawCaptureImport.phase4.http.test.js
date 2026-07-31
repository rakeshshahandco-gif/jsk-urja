/**
 * Checkpoint 4 — RawCapture import HTTP tests (real auth/scope/module/multer/routes).
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

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `RC4-HTTP-${Date.now()}`;
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';
const BASE = '/api/v1/data-extractor/search-campaigns';

let server; let baseUrl;
let companyA; let companyB;
let tokens = {};
let campaignAId; let campaignBId; let queryAId;
let importRunId;
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

async function apiMultipart(path, {
    token, companyId, fields = {}, file, fileField = 'file', extraFile = null,
} = {}) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
        form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    if (file) {
        form.append(fileField, new Blob([file.buffer], { type: file.mime || 'application/octet-stream' }), file.name);
    }
    if (extraFile) {
        form.append(extraFile.field || 'extra', new Blob([extraFile.buffer]), extraFile.name || 'extra.bin');
    }
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
    assert.doesNotMatch(s, /Cast to ObjectId failed|MongoServerError|E11000|mongodb:\/\/|\\\\node_modules\\\\/i);
    if (payload && typeof payload === 'object' && !payload.raw) {
        assert.equal(Object.prototype.hasOwnProperty.call(payload, 'stack'), false);
    }
}

async function xlsxBuf() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    ws.addRow(['Company', 'Website']);
    ws.addRow(['HTTP Co', `https://http-xlsx-${TAG.toLowerCase()}.example.com`]);
    return Buffer.from(await wb.xlsx.writeBuffer());
}

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    await mongoose.connect(MONGO_URI);
    leadsBefore = await ExtractedLead.countDocuments({}).catch(() => 0);
    crmBefore = await Lead.countDocuments({}).catch(() => 0);

    companyA = await Company.create({
        companyName: `RC4 A ${TAG}`, isActive: true, moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });
    companyB = await Company.create({
        companyName: `RC4 B ${TAG}`, isActive: true, moduleGuardEnabled: false,
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
        full: await mk('full', view, { view: true }, {
            view: true, ingest: true, import: true, manage: true, archive: true,
        }),
        importOnly: await mk('imp', view, { view: true }, {
            view: true, ingest: false, import: true, manage: false, archive: false,
        }),
        ingestOnly: await mk('ing', view, { view: true }, {
            view: true, ingest: true, import: false, manage: false, archive: false,
        }),
        noImport: await mk('noimp', view, { view: true }, {
            view: true, ingest: false, import: false, manage: false, archive: false,
        }),
        importNoQuery: await mk('inq', view, { view: false }, {
            view: true, ingest: true, import: true, manage: false, archive: false,
        }),
    };
    for (const [k, u] of Object.entries(users)) tokens[k] = tokenFor(u);

    const campA = await SearchCampaign.create({
        companyId: companyA._id, name: `RC4 Camp A ${TAG}`, nameNormalized: `rc4 camp a ${TAG}`,
        targetIndustry: 'Home Automation', country: 'India', sources: ['google'], status: 'active',
    });
    const campB = await SearchCampaign.create({
        companyId: companyB._id, name: `RC4 Camp B ${TAG}`, nameNormalized: `rc4 camp b ${TAG}`,
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
    await RawCaptureImportRun.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await SearchQuery.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await SearchCampaign.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) }, name: new RegExp(TAG) });
    await User.deleteMany({ email: new RegExp(TAG, 'i') });
    await Company.deleteMany({ companyName: new RegExp(TAG) });
    await mongoose.disconnect();
});

describe('CP4 HTTP auth/permissions', () => {
    it('1. no token → 401', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/preview/manual-urls`, {
            companyId: companyA._id, body: { urls: ['https://a.example.com'] },
        })).status, 401);
    });

    it('2. no import permission → 403 preview', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/preview/manual-urls`, {
            token: tokens.noImport, companyId: companyA._id, body: { urls: ['https://a.example.com'] },
        })).status, 403);
    });

    it('3. no ingest permission → 403 commit', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/ingest/manual-urls`, {
            token: tokens.importOnly, companyId: companyA._id,
            body: { source: 'manual', idempotencyKey: `noing-${TAG}`, urls: ['https://a.example.com'] },
        })).status, 403);
    });

    it('4. query-linked commit without SearchQuery view → 403', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/ingest/manual-urls`, {
            token: tokens.importNoQuery, companyId: companyA._id,
            body: {
                source: 'manual', idempotencyKey: `noqv-${TAG}`, queryId: String(queryAId),
                urls: ['https://a.example.com'],
            },
        })).status, 403);
    });
});

describe('CP4 HTTP valid preview/commit', () => {
    it('5-6. manual URL preview and commit', async () => {
        const before = await RawCapture.countDocuments({ companyId: companyA._id });
        const prev = await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/preview/manual-urls`, {
            token: tokens.full, companyId: companyA._id,
            body: { urls: [`https://http-man-${TAG.toLowerCase()}.example.com`] },
        });
        assert.equal(prev.status, 200);
        assert.equal(await RawCapture.countDocuments({ companyId: companyA._id }), before);

        const commit = await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/ingest/manual-urls`, {
            token: tokens.full, companyId: companyA._id,
            body: {
                source: 'manual', idempotencyKey: `http-man-${TAG}`,
                urls: [`https://http-man-${TAG.toLowerCase()}.example.com`],
            },
        });
        assert.equal(commit.status, 201);
        assert.equal(commit.json.data.status, 'completed');
        importRunId = commit.json.data.importRunId;
        assertNoLeak(commit.json);
    });

    it('7-8. pasted-text preview and commit', async () => {
        const prev = await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/preview/pasted-text`, {
            token: tokens.full, companyId: companyA._id,
            body: { text: `https://http-paste-${TAG.toLowerCase()}.example.com` },
        });
        assert.equal(prev.status, 200);
        const commit = await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/ingest/pasted-text`, {
            token: tokens.full, companyId: companyA._id,
            body: {
                source: 'manual', idempotencyKey: `http-paste-${TAG}`,
                text: `https://http-paste-${TAG.toLowerCase()}.example.com`,
            },
        });
        assert.equal(commit.status, 201);
    });

    it('9-12. CSV and XLSX preview/commit', async () => {
        const csv = Buffer.from(`Company,Website\nCSV Co,https://http-csv-${TAG.toLowerCase()}.example.com\n`, 'utf8');
        const prevCsv = await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/preview/file`, {
            token: tokens.full, companyId: companyA._id,
            fields: { source: 'manual' },
            file: { buffer: csv, name: 't.csv', mime: 'text/csv' },
        });
        assert.equal(prevCsv.status, 200);
        assert.ok(prevCsv.json.data.availableColumns);

        const commitCsv = await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/ingest/file`, {
            token: tokens.full, companyId: companyA._id,
            fields: {
                source: 'manual',
                idempotencyKey: `http-csv-${TAG}`,
                columnMapping: JSON.stringify({ title: 'Company', resultUrl: 'Website' }),
            },
            file: { buffer: csv, name: 't.csv', mime: 'text/csv' },
        });
        assert.equal(commitCsv.status, 201);

        const xbuf = await xlsxBuf();
        const prevX = await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/preview/file`, {
            token: tokens.full, companyId: companyA._id,
            file: { buffer: xbuf, name: 't.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        });
        assert.equal(prevX.status, 200);

        const commitX = await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/ingest/file`, {
            token: tokens.full, companyId: companyA._id,
            fields: {
                source: 'manual',
                idempotencyKey: `http-xlsx-${TAG}`,
                columnMapping: JSON.stringify({ title: 'Company', resultUrl: 'Website' }),
            },
            file: { buffer: xbuf, name: 't.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        });
        assert.equal(commitX.status, 201);
    });
});

describe('CP4 HTTP isolation and validation', () => {
    it('13-16. companyId rejected; cross-company 404s', async () => {
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/preview/manual-urls`, {
            token: tokens.full, companyId: companyA._id,
            body: { urls: ['https://x.example.com'], companyId: String(companyB._id) },
        })).status, 400);

        assert.equal((await api('POST', `${BASE}/${campaignBId}/raw-capture-imports/preview/manual-urls`, {
            token: tokens.full, companyId: companyA._id,
            body: { urls: ['https://x.example.com'] },
        })).status, 404);

        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/ingest/manual-urls`, {
            token: tokens.full, companyId: companyA._id,
            body: {
                source: 'manual', idempotencyKey: `xq-${TAG}`,
                queryId: new mongoose.Types.ObjectId().toString(),
                urls: ['https://x.example.com'],
            },
        })).status, 404);

        const secret = await RawCaptureImportRun.create({
            companyId: companyB._id, campaignId: campaignBId, adapterType: 'manual_url',
            source: 'manual', captureMethod: 'manual_url', idempotencyKey: `sec-${TAG}`,
            requestFingerprint: 'b'.repeat(64), status: 'completed',
        });
        assert.equal((await api('GET', `${BASE}/${campaignBId}/raw-capture-imports/${secret._id}`, {
            token: tokens.full, companyId: companyA._id,
        })).status, 404);
    });

    it('17-20. invalid IDs and unknown fields', async () => {
        assert.equal((await api('GET', `${BASE}/not-an-id/raw-capture-imports`, {
            token: tokens.full, companyId: companyA._id,
        })).status, 404);
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/ingest/manual-urls`, {
            token: tokens.full, companyId: companyA._id,
            body: { source: 'manual', idempotencyKey: `iq-${TAG}`, queryId: 'bad', urls: ['https://x.example.com'] },
        })).status, 404);
        assert.equal((await api('GET', `${BASE}/${campaignAId}/raw-capture-imports/not-an-id`, {
            token: tokens.full, companyId: companyA._id,
        })).status, 404);
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/preview/manual-urls`, {
            token: tokens.full, companyId: companyA._id,
            body: { urls: ['https://x.example.com'], weirdField: 1 },
        })).status, 200); // unknown fields on preview manual are ignored except forbidden — weirdField not forbidden
        // Force unknown unsafe
        assert.equal((await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/preview/manual-urls`, {
            token: tokens.full, companyId: companyA._id,
            body: { urls: ['https://x.example.com'], $where: 1 },
        })).status, 400);
    });

    it('21-24. multipart extra file / bad extension / signature', async () => {
        const csv = Buffer.from('URL\nhttps://a.example.com\n', 'utf8');
        const extra = await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/preview/file`, {
            token: tokens.full, companyId: companyA._id,
            file: { buffer: csv, name: 't.csv', mime: 'text/csv' },
            extraFile: { buffer: Buffer.from('x'), name: 'e.bin', field: 'extra' },
        });
        // multer rejects unexpected extra files (LIMIT_UNEXPECTED_FILE / Too many files)
        assert.ok([400].includes(extra.status));
        assertNoLeak(extra.json);

        assert.equal((await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/preview/file`, {
            token: tokens.full, companyId: companyA._id,
            file: { buffer: csv, name: 't.xls', mime: 'application/vnd.ms-excel' },
        })).status, 400);

        assert.equal((await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/preview/file`, {
            token: tokens.full, companyId: companyA._id,
            file: { buffer: Buffer.from('not-a-zip'), name: 'bad.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        })).status, 400);
    });

    it('25-26. same-key replay and conflict', async () => {
        const body = {
            source: 'manual', idempotencyKey: `http-replay-${TAG}`,
            urls: [`https://http-replay-${TAG.toLowerCase()}.example.com`],
        };
        const a = await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/ingest/manual-urls`, {
            token: tokens.full, companyId: companyA._id, body,
        });
        assert.equal(a.status, 201);
        const b = await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/ingest/manual-urls`, {
            token: tokens.full, companyId: companyA._id, body,
        });
        assert.equal(b.status, 200);
        assert.equal(b.json.data.idempotentReplay, true);
        const c = await api('POST', `${BASE}/${campaignAId}/raw-capture-imports/ingest/manual-urls`, {
            token: tokens.full, companyId: companyA._id,
            body: { ...body, urls: [`https://http-conflict-${TAG.toLowerCase()}.example.com`] },
        });
        assert.equal(c.status, 409);
        assert.equal(c.json.errorCode, 'IDEMPOTENCY_KEY_REUSED');
        assertNoLeak(c.json);
    });

    it('27-31. safe response, no DELETE, no side effects', async () => {
        assert.ok([404, 405].includes((await api('DELETE', `${BASE}/${campaignAId}/raw-capture-imports/${importRunId}`, {
            token: tokens.full, companyId: companyA._id,
        })).status));
        const detail = await api('GET', `${BASE}/${campaignAId}/raw-capture-imports/${importRunId}`, {
            token: tokens.full, companyId: companyA._id,
        });
        assert.equal(detail.status, 200);
        assertNoLeak(detail.json);
        assert.equal(await ExtractedLead.countDocuments({}).catch(() => 0), leadsBefore);
        assert.equal(await Lead.countDocuments({}).catch(() => 0), crmBefore);
    });
});
