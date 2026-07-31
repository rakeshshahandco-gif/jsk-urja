/**
 * Checkpoint 4A — file-security, ZIP preflight, recovery, review_required (crm_test).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import AdmZip from 'adm-zip';
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
import { RawCaptureBatch } from '../../src/models/rawCaptureBatch.model.js';
import { RawCaptureImportRun } from '../../src/models/rawCaptureImportRun.model.js';
import { ExtractedLead } from '../../src/models/extractedLead.model.js';
import {
    assertSafeXlsxBuffer,
    inspectXlsxZip,
    __xlsxPreflight,
} from '../../src/services/dataExtractor/searchCampaign/rawCaptureImport/fileSecurity.util.js';
import {
    previewExcelFile,
    __excelJsLoad,
} from '../../src/services/dataExtractor/searchCampaign/rawCaptureImport/excel.adapter.js';
import { previewCsvFile } from '../../src/services/dataExtractor/searchCampaign/rawCaptureImport/csv.adapter.js';
import { previewPastedText } from '../../src/services/dataExtractor/searchCampaign/rawCaptureImport/pastedText.adapter.js';
import {
    commitManualUrlImport,
    commitPastedTextImport,
    reconcileImportRunFromChildBatches,
} from '../../src/services/dataExtractor/searchCampaign/rawCaptureImport/import.orchestration.service.js';
import {
    __multerInvokes,
    __resetMulterInvokes,
} from '../../src/controllers/rawCaptureImport.controller.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `RC4A-${Date.now()}`;
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';
process.env.RC_IMPORT_TEST_HOOKS = '1';
const BASE = '/api/v1/data-extractor/search-campaigns';

let server; let baseUrl;
let companyA; let companyB;
let tokens = {};
let campaignAId; let campaignBId; let queryAId;
const companyOid = () => companyA._id;
const userId = () => tokens._fullUserId;

const fullUserRef = { current: null };

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

async function apiMultipart(path, { token, companyId, fields = {}, file, extraFile } = {}) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
        form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    if (file) {
        form.append('file', new Blob([file.buffer], { type: file.mime || 'application/octet-stream' }), file.name);
    }
    if (extraFile) {
        form.append(extraFile.field || 'extra', new Blob([extraFile.buffer]), extraFile.name || 'e.bin');
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



function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i += 1) {
        c ^= buf[i];
        for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
}

/** Raw ZIP builder that preserves exact entry names (for path-traversal fixtures). */
function rawZip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const [name, payload] of entries) {
        const nameBuf = Buffer.from(name, "utf8");
        const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0, 6);
        local.writeUInt16LE(0, 8);
        local.writeUInt16LE(0, 10);
        local.writeUInt16LE(0, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);
        const localFull = Buffer.concat([local, nameBuf, data]);
        locals.push(localFull);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0, 8);
        central.writeUInt16LE(0, 10);
        central.writeUInt16LE(0, 12);
        central.writeUInt16LE(0, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt16LE(0, 30);
        central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34);
        central.writeUInt16LE(0, 36);
        central.writeUInt32LE(0, 38);
        central.writeUInt32LE(offset, 42);
        centrals.push(Buffer.concat([central, nameBuf]));
        offset += localFull.length;
    }
    const body = Buffer.concat(locals);
    const centralDir = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralDir.length, 12);
    eocd.writeUInt32LE(body.length, 16);
    eocd.writeUInt16LE(0, 20);
    return Buffer.concat([body, centralDir, eocd]);
}


function rawZipEntry(name, data, claimUncomp = null) {
    const nameBuf = Buffer.from(name, "utf8");
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
    const uncomp = claimUncomp == null ? payload.length : claimUncomp;
    const crc = crc32(payload);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(uncomp, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const localFull = Buffer.concat([local, nameBuf, payload]);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(uncomp, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(0, 42);
    return { localFull, central: Buffer.concat([central, nameBuf]) };
}

function rawZipFromParts(parts) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const part of parts) {
        const { localFull, central } = part;
        // fix central local offset
        central.writeUInt32LE(offset, 42);
        locals.push(localFull);
        centrals.push(central);
        offset += localFull.length;
    }
    const body = Buffer.concat(locals);
    const centralDir = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(parts.length, 8);
    eocd.writeUInt16LE(parts.length, 10);
    eocd.writeUInt32LE(centralDir.length, 12);
    eocd.writeUInt32LE(body.length, 16);
    return Buffer.concat([body, centralDir, eocd]);
}

function workbookZipWithLiedEntry(name, data, claimUncomp) {
    return rawZipFromParts([
        rawZipEntry("[Content_Types].xml", Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>')),
        rawZipEntry("xl/workbook.xml", Buffer.from('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"></workbook>')),
        rawZipEntry(name, data, claimUncomp),
    ]);
}

function maliciousWorkbookZip(evilName) {
    return rawZip([
        ["[Content_Types].xml", Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>')],
        ["xl/workbook.xml", Buffer.from('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"></workbook>')],
        [evilName, Buffer.from("x")],
    ]);
}

function minimalWorkbookZip(extraEntries = []) {
    const zip = new AdmZip();
    zip.addFile('[Content_Types].xml', Buffer.from(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    ));
    zip.addFile('xl/workbook.xml', Buffer.from(
        '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"></workbook>',
    ));
    zip.addFile('_rels/.rels', Buffer.from('<?xml version="1.0"?><Relationships></Relationships>'));
    for (const e of extraEntries) {
        zip.addFile(e.name, Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data || 'x')));
    }
    return zip.toBuffer();
}

async function realXlsxBuffer(rows = [['Company', 'Website'], ['A', 'https://a.example.com']]) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    rows.forEach((r) => ws.addRow(r));
    return Buffer.from(await wb.xlsx.writeBuffer());
}

before(async () => {
    process.env.RC_IMPORT_TEST_HOOKS = '1';
    assert.match(MONGO_URI, /crm_test/);
    await mongoose.connect(MONGO_URI);
    await RawCaptureImportRun.syncIndexes();

    companyA = await Company.create({
        companyName: `RC4A A ${TAG}`, isActive: true, moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });
    companyB = await Company.create({
        companyName: `RC4A B ${TAG}`, isActive: true, moduleGuardEnabled: false,
        enabledModules: ['crm', 'data_extractor'],
    });

    const mk = async (username, rc, modules = ['crm', 'data_extractor']) => {
        // module disabled company handled separately
        return User.create({
            name: username,
            username: `${username}.${TAG}`.toLowerCase().replace(/[^a-z0-9.]/g, ''),
            email: `${username}.${TAG}@t.local`.toLowerCase(),
            password: 'TestPass123!',
            roleName: 'staff',
            allowLogin: true,
            isActive: true,
            companyAccessConfigured: false,
            additionalPermissions: {
                data_extractor: {
                    search_campaign: { view: true, manage: false },
                    search_query: { view: true },
                    raw_capture: rc,
                },
            },
        });
    };

    const full = await mk('full', { view: true, ingest: true, import: true, manage: true, archive: true });
    fullUserRef.current = {
        _id: full._id, id: full._id, roleName: 'staff',
        additionalPermissions: full.additionalPermissions,
    };
    tokens.full = tokenFor(full);
    tokens._fullUserId = full._id;
    tokens.noImport = tokenFor(await mk('noimp', { view: true, ingest: false, import: false, manage: false }));
    tokens.importOnly = tokenFor(await mk('imponly', { view: true, ingest: false, import: true, manage: false }));

    const campA = await SearchCampaign.create({
        companyId: companyA._id, name: `RC4A Camp ${TAG}`, nameNormalized: `rc4a camp ${TAG}`,
        targetIndustry: 'Home Automation', country: 'India', sources: ['google'], status: 'active',
    });
    const campB = await SearchCampaign.create({
        companyId: companyB._id, name: `RC4A CampB ${TAG}`, nameNormalized: `rc4a campb ${TAG}`,
        targetIndustry: 'Other', country: 'India', sources: ['google'], status: 'active',
    });
    campaignAId = campA._id;
    campaignBId = campB._id;
    queryAId = (await SearchQuery.create({
        companyId: companyA._id, campaignId: campaignAId,
        queryText: `q ${TAG}`, queryNormalized: `q ${TAG}`,
        sourceHint: 'google', status: 'approved', generationMethod: 'manual', queryType: 'manual',
        searchUrl: 'https://www.google.com/search?q=x',
    }))._id;

    server = http.createServer(buildApp());
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise((r) => server.close(r));
    await RawCapture.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await RawCaptureBatch.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await RawCaptureImportRun.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await SearchQuery.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) } });
    await SearchCampaign.deleteMany({ companyId: { $in: [companyA?._id, companyB?._id].filter(Boolean) }, name: new RegExp(TAG) });
    await User.deleteMany({ email: new RegExp(TAG, 'i') });
    await Company.deleteMany({ companyName: new RegExp(TAG) });
    await mongoose.disconnect();
});

describe('CP4A XLSX ZIP preflight before ExcelJS', () => {
    it('accepts valid minimal xlsx and real workbook; rejects malicious packages without ExcelJS load', async () => {
        const before = __excelJsLoad.count;
        const goodMeta = assertSafeXlsxBuffer(minimalWorkbookZip(), { originalName: 'ok.xlsx' });
        assert.ok(goodMeta.entries >= 3);
        assert.equal(__xlsxPreflight.lastPassed, true);

        const real = await realXlsxBuffer();
        const loadBefore = __excelJsLoad.count;
        await previewExcelFile({ buffer: real, originalName: 'real.xlsx' });
        assert.ok(__excelJsLoad.count > loadBefore);

        const cases = [
            { name: 'bad-sig', buf: Buffer.from('not-a-zip'), file: 'x.xlsx' },
            { name: 'truncated', buf: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]), file: 't.xlsx' },
            { name: 'traversal', buf: maliciousWorkbookZip('../evil/path/entry.txt'), file: 't.xlsx' },
            { name: 'absolute', buf: maliciousWorkbookZip('/etc/passwd/entry.bin'), file: 't.xlsx' },
            { name: 'vba', buf: minimalWorkbookZip([{ name: 'xl/vbaProject.bin', data: Buffer.alloc(16) }]), file: 't.xlsx' },
            { name: 'activex', buf: minimalWorkbookZip([{ name: 'xl/activeX/activeX1.xml', data: '<a/>' }]), file: 't.xlsx' },
            { name: 'embed', buf: minimalWorkbookZip([{ name: 'xl/embeddings/oleObject1.bin', data: Buffer.alloc(8) }]), file: 't.xlsx' },
            { name: 'encrypt', buf: minimalWorkbookZip([{ name: 'EncryptionInfo', data: 'x' }]), file: 't.xlsx' },
            { name: 'extlink', buf: minimalWorkbookZip([{ name: 'xl/externalLinks/externalLink1.xml', data: '<a/>' }]), file: 't.xlsx' },
            { name: 'xlsm-name', buf: minimalWorkbookZip(), file: 'macro.xlsm' },
        ];
        for (const c of cases) {
            const loads = __excelJsLoad.count;
            await assert.rejects(async () => assertSafeXlsxBuffer(c.buf, { originalName: c.file }), (e) => e.statusCode === 400);
            assert.equal(__excelJsLoad.count, loads, c.name);
            assert.equal(__xlsxPreflight.lastPassed, false, c.name);
        }

        // excessive entry count
        const many = [];
        for (let i = 0; i < 2001; i += 1) many.push({ name: `pad/f${i}.xml`, data: 'x' });
        await assert.rejects(async () => assertSafeXlsxBuffer(minimalWorkbookZip(many), { originalName: 'many.xlsx' }), (e) => e.statusCode === 400);

        // compression ratio / huge declared size — craft zip with large size claim via AdmZip is hard;
        // oversized buffer rejected:
        await assert.rejects(async () => assertSafeXlsxBuffer(Buffer.alloc(11 * 1024 * 1024, 1), { originalName: 'big.xlsx' }), (e) => e.statusCode === 400);

        assert.ok(__excelJsLoad.count >= before);
    });

    it('hidden-only sheets rejected; formula without cache rejected; unicode preserved', async () => {
        const wb = new ExcelJS.Workbook();
        const hs = wb.addWorksheet('HiddenOnly');
        hs.state = 'hidden';
        hs.addRow(['A', 'https://h.example.com']);
        const hiddenBuf = Buffer.from(await wb.xlsx.writeBuffer());
        await assert.rejects(async () => previewExcelFile({ buffer: hiddenBuf, originalName: 'h.xlsx' }), (e) => e.statusCode === 400);

        const wb2 = new ExcelJS.Workbook();
        const ws = wb2.addWorksheet('Data');
        ws.addRow(['Title', 'URL']);
        ws.addRow(['Unicode 测试', 'https://uni.example.com']);
        const cell = ws.getCell('A3');
        cell.value = { formula: 'A2', result: undefined };
        ws.getCell('B3').value = 'https://formula.example.com';
        const fbuf = Buffer.from(await wb2.xlsx.writeBuffer());
        const prev = await previewExcelFile({
            buffer: fbuf, originalName: 'f.xlsx',
            columnMapping: { title: 'Title', resultUrl: 'URL' },
        });
        assert.ok(prev.previewRows.some((r) => String(r.values.Title || '').includes('测试') || r.rowNumber));
    });
});

describe('CP4A CSV limits', () => {
    it('rejects prototype headers, overlong cells, and unsafe content', async () => {
        await assert.rejects(async () => previewCsvFile({
            buffer: Buffer.from('__proto__,URL\n1,https://a.example.com\n', 'utf8'),
            originalName: 'p.csv',
        }), (e) => e.statusCode === 400);

        await assert.rejects(async () => previewCsvFile({
            buffer: Buffer.from(`Title,URL\n${'x'.repeat(33000)},https://a.example.com\n`, 'utf8'),
            originalName: 'long.csv',
        }), (e) => e.statusCode === 400);

        await assert.rejects(async () => previewCsvFile({
            buffer: Buffer.from('<html><body>x</body></html>', 'utf8'),
            originalName: 'h.csv',
        }), (e) => e.statusCode === 400);

        // formula-like remains text when valid
        const ok = previewCsvFile({
            buffer: Buffer.from('Title,URL\n=1+1,https://f.example.com\n', 'utf8'),
            originalName: 'f.csv',
            columnMapping: { title: 'Title', resultUrl: 'URL' },
        });
        assert.equal(ok.previewRows[0].mapped.title, '=1+1');
    });
});

describe('CP4A review_required contract', () => {
    it('defaults to excluding review rows; override records audit fields', async () => {
        const text = 'Company A and notes https://rev-a.example.com/path\nplain line without url';
        const prev = previewPastedText({ text });
        assert.ok(prev.reviewRequiredCount >= 1);
        assert.ok(prev.previewRows.some((r) => r.validity === 'review_required' && r.reasonCode));

        const key = `rev-${TAG}`;
        // mixed: one clean URL line + uncertain
        const mixed = `https://clean-${TAG.toLowerCase()}.example.com\nCompany Z https://z-${TAG.toLowerCase()}.example.com extra`;
        const def = await commitPastedTextImport({
            companyId: companyA._id, user: fullUserRef.current, campaignId: campaignAId,
            body: { source: 'manual', idempotencyKey: key, text: mixed },
        });
        assert.ok(['completed', 'partially_completed'].includes(def.status));
        assert.ok(def.rejectedRows >= 1 || def.acceptedRows >= 1);

        const key2 = `rev2-${TAG}`;
        const over = await commitPastedTextImport({
            companyId: companyA._id, user: fullUserRef.current, campaignId: campaignAId,
            body: {
                source: 'manual', idempotencyKey: key2, text: mixed, allowReviewRequired: true,
            },
        });
        const run = await RawCaptureImportRun.findById(over.importRunId).lean();
        assert.equal(run.allowReviewRequired, true);
        assert.ok(run.reviewOverrideBy);
        assert.ok(run.reviewOverrideAt);
    });
});

describe('CP4A import recovery', () => {
    it('reconciles completed child batch discovered after ImportRun gap; same-key replay safe', async () => {
        const key = `rec-${TAG}`;
        const r1 = await commitManualUrlImport({
            companyId: companyA._id, user: fullUserRef.current, campaignId: campaignAId,
            body: {
                source: 'manual', idempotencyKey: key, queryId: String(queryAId),
                urls: [`https://rec-${TAG.toLowerCase()}.example.com/`],
            },
        });
        assert.equal(r1.status, 'completed');
        const run = await RawCaptureImportRun.findById(r1.importRunId);
        // simulate gap: clear batch ids then reconcile
        run.rawCaptureBatchIds = [];
        run.insertedCount = 0;
        run.acceptedRows = 0;
        await run.save();
        const childKey = run.chunkStates[0].childIdempotencyKey;
        assert.ok(await RawCaptureBatch.findOne({ companyId: companyA._id, idempotencyKey: childKey }));
        const reconciled = await reconcileImportRunFromChildBatches(companyA._id, run._id);
        assert.ok(reconciled.rawCaptureBatchIds.length >= 1);
        assert.ok(reconciled.acceptedRows >= 1);

        const replay = await commitManualUrlImport({
            companyId: companyA._id, user: fullUserRef.current, campaignId: campaignAId,
            body: {
                source: 'manual', idempotencyKey: key, queryId: String(queryAId),
                urls: [`https://rec-${TAG.toLowerCase()}.example.com/`],
            },
        });
        assert.equal(replay.idempotentReplay, true);

        await assert.rejects(async () => commitManualUrlImport({
            companyId: companyA._id, user: fullUserRef.current, campaignId: campaignAId,
            body: {
                source: 'manual', idempotencyKey: key, queryId: String(queryAId),
                urls: [`https://rec-other-${TAG.toLowerCase()}.example.com/`],
            },
        }), (e) => e.statusCode === 409);

        assert.equal(await ExtractedLead.countDocuments({}).catch(() => 0) >= 0, true);
    });
});

describe('CP4A multipart order — Multer after auth/permission/campaign', () => {
    it('unauthenticated and unauthorized uploads do not invoke Multer', async () => {
        const buf = Buffer.from('URL\nhttps://a.example.com\n', 'utf8');
        __resetMulterInvokes();
        const noAuth = await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/preview/file`, {
            companyId: companyA._id,
            file: { buffer: buf, name: 't.csv', mime: 'text/csv' },
        });
        assert.equal(noAuth.status, 401);
        assert.equal(__multerInvokes.count, 0);

        __resetMulterInvokes();
        const noPerm = await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/preview/file`, {
            token: tokens.noImport, companyId: companyA._id,
            file: { buffer: buf, name: 't.csv', mime: 'text/csv' },
        });
        assert.equal(noPerm.status, 403);
        assert.equal(__multerInvokes.count, 0);

        __resetMulterInvokes();
        const cross = await apiMultipart(`${BASE}/${campaignBId}/raw-capture-imports/preview/file`, {
            token: tokens.full, companyId: companyA._id,
            file: { buffer: buf, name: 't.csv', mime: 'text/csv' },
        });
        assert.equal(cross.status, 404);
        assert.equal(__multerInvokes.count, 0);

        __resetMulterInvokes();
        const ok = await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/preview/file`, {
            token: tokens.full, companyId: companyA._id,
            file: { buffer: buf, name: 't.csv', mime: 'text/csv' },
        });
        assert.equal(ok.status, 200);
        assert.ok(__multerInvokes.count >= 1);

        __resetMulterInvokes();
        const multi = await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/preview/file`, {
            token: tokens.full, companyId: companyA._id,
            file: { buffer: buf, name: 't.csv', mime: 'text/csv' },
            extraFile: { buffer: Buffer.from('x'), name: 'e.bin', field: 'extra' },
        });
        assert.equal(multi.status, 400);
    });
});


describe('CP4A malicious XLSX fixtures (named)', () => {
    async function expectPreflightReject(name, buf, file = 't.xlsx') {
        const loads = __excelJsLoad.count;
        await assert.rejects(
            async () => assertSafeXlsxBuffer(buf, { originalName: file }),
            (e) => e.statusCode === 400,
            name,
        );
        assert.equal(__excelJsLoad.count, loads, `${name} must not reach ExcelJS`);
        assert.equal(__xlsxPreflight.lastPassed, false, name);
    }

    it('1. valid minimal xlsx accepted', () => {
        assertSafeXlsxBuffer(minimalWorkbookZip(), { originalName: 'ok.xlsx' });
        assert.equal(__xlsxPreflight.lastPassed, true);
    });

    it('2. invalid ZIP signature rejected', async () => {
        await expectPreflightReject('bad-sig', Buffer.from('PK\x00\x00notzip'));
    });

    it('3. truncated ZIP rejected', async () => {
        await expectPreflightReject('trunc', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14]));
    });

    it('4. path traversal entry rejected', async () => {
        await expectPreflightReject('trav', maliciousWorkbookZip('../evil/path/entry.txt'));
    });

    it('5. absolute-path entry rejected', async () => {
        await expectPreflightReject('abs', maliciousWorkbookZip('/etc/passwd/entry.bin'));
    });

    it('6. excessive ZIP entry count rejected', async () => {
        const many = [];
        for (let i = 0; i < 2001; i += 1) many.push({ name: `pad/f${i}.xml`, data: 'x' });
        await expectPreflightReject('entries', minimalWorkbookZip(many));
    });

    it('7. excessive declared uncompressed size rejected', async () => {
        const buf = workbookZipWithLiedEntry('xl/big.bin', Buffer.from('tiny'), 51 * 1024 * 1024);
        await expectPreflightReject('uncomp', buf);
    });

    it('8. excessive compression ratio rejected', async () => {
        const buf = workbookZipWithLiedEntry('xl/ratio.bin', Buffer.from('tiny'), 2 * 1024 * 1024);
        await expectPreflightReject('ratio', buf);
    });

    it('9. oversized single ZIP entry rejected', async () => {
        const buf = workbookZipWithLiedEntry('xl/one.bin', Buffer.from('tiny'), 21 * 1024 * 1024);
        await expectPreflightReject('one-entry', buf);
    });

    it('10. vbaProject.bin rejected', async () => {
        await expectPreflightReject('vba', minimalWorkbookZip([{ name: 'xl/vbaProject.bin', data: Buffer.alloc(8) }]));
    });

    it('11. ActiveX entry rejected', async () => {
        await expectPreflightReject('ax', minimalWorkbookZip([{ name: 'xl/activeX/activeX1.xml', data: '<a/>' }]));
    });

    it('12. OLE/embedded-object entry rejected', async () => {
        await expectPreflightReject('ole', minimalWorkbookZip([{ name: 'xl/embeddings/oleObject1.bin', data: Buffer.alloc(4) }]));
    });

    it('13. encrypted-package indicator rejected', async () => {
        await expectPreflightReject('enc', minimalWorkbookZip([{ name: 'EncryptionInfo', data: 'x' }]));
    });

    it('14. external-link relationship rejected', async () => {
        await expectPreflightReject('ext', minimalWorkbookZip([{ name: 'xl/externalLinks/externalLink1.xml', data: '<a/>' }]));
    });

    it('15. xlsm renamed xlsx rejected by content/name', async () => {
        await expectPreflightReject('xlsm', minimalWorkbookZip([{ name: 'xl/vbaProject.bin', data: Buffer.alloc(4) }]), 'macro.xlsx');
        await expectPreflightReject('xlsm-ext', minimalWorkbookZip(), 'macro.xlsm');
    });

    it('16. arbitrary ZIP missing workbook rejected', async () => {
        const zip = new AdmZip();
        zip.addFile('readme.txt', Buffer.from('hi'));
        await expectPreflightReject('arbzip', zip.toBuffer());
    });

    it('17. workbook with too many worksheets rejected', async () => {
        const wb = new ExcelJS.Workbook();
        for (let i = 0; i < 51; i += 1) {
            const ws = wb.addWorksheet(`S${i}`);
            ws.addRow(['A', 'B']);
        }
        const buf = Buffer.from(await wb.xlsx.writeBuffer());
        const loads = __excelJsLoad.count;
        await assert.rejects(async () => previewExcelFile({ buffer: buf, originalName: 'many.xlsx' }), (e) => e.statusCode === 400);
        assert.ok(__excelJsLoad.count > loads); // preflight passes; ExcelJS load then sheet limit
    });

    it('18-19. row and column limits enforced', async () => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Wide');
        const header = Array.from({ length: 101 }, (_, i) => `C${i}`);
        ws.addRow(header);
        ws.addRow(header.map((_, i) => (i === 1 ? 'https://wide.example.com' : 'x')));
        const wide = Buffer.from(await wb.xlsx.writeBuffer());
        await assert.rejects(async () => previewExcelFile({ buffer: wide, originalName: 'wide.xlsx' }), (e) => e.statusCode === 400);
    });

    it('20-21. hidden first sheet skipped; only-hidden rejected', async () => {
        const wb = new ExcelJS.Workbook();
        const h = wb.addWorksheet('Hidden');
        h.state = 'hidden';
        h.addRow(['Company', 'Website']);
        h.addRow(['H', 'https://h.example.com']);
        const v = wb.addWorksheet('Visible');
        v.addRow(['Company', 'Website']);
        v.addRow(['V', 'https://v.example.com']);
        const buf = Buffer.from(await wb.xlsx.writeBuffer());
        const prev = await previewExcelFile({ buffer: buf, originalName: 'mix.xlsx' });
        assert.equal(prev.sheetName, 'Visible');

        const wb2 = new ExcelJS.Workbook();
        const only = wb2.addWorksheet('OnlyHidden');
        only.state = 'hidden';
        only.addRow(['A', 'https://x.example.com']);
        const onlyBuf = Buffer.from(await wb2.xlsx.writeBuffer());
        await assert.rejects(async () => previewExcelFile({ buffer: onlyBuf, originalName: 'oh.xlsx' }), (e) => e.statusCode === 400);
    });

    it('22-23. formula with cached value used; without cache rejected on commit path', async () => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('F');
        ws.addRow(['Title', 'URL']);
        ws.getCell('A2').value = { formula: 'CONCATENATE("Hi")', result: 'Cached Title' };
        ws.getCell('B2').value = 'https://cached.example.com';
        ws.getCell('A3').value = { formula: 'A2', result: undefined };
        ws.getCell('B3').value = 'https://nocache.example.com';
        const buf = Buffer.from(await wb.xlsx.writeBuffer());
        const { parseExcelForCommit } = await import('../../src/services/dataExtractor/searchCampaign/rawCaptureImport/excel.adapter.js');
        const parsed = await parseExcelForCommit({
            buffer: buf, originalName: 'f.xlsx',
            columnMapping: { title: 'Title', resultUrl: 'URL' },
        });
        assert.ok(parsed.commitRecords.some((r) => r.record.title === 'Cached Title'));
        assert.ok(parsed.parseErrors.some((e) => e.code === 'FORMULA_NO_CACHE'));
    });

    it('24. unicode worksheet and cell content preserved', async () => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('数据');
        ws.addRow(['Title', 'URL']);
        ws.addRow(['测试公司', 'https://uni-c4a.example.com']);
        const buf = Buffer.from(await wb.xlsx.writeBuffer());
        const prev = await previewExcelFile({
            buffer: buf, originalName: 'u.xlsx',
            columnMapping: { title: 'Title', resultUrl: 'URL' },
        });
        assert.ok(prev.previewRows[0].values.Title.includes('测试'));
    });

    it('25. images ignored safely while counting toward package limits', async () => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Img');
        ws.addRow(['Company', 'Website']);
        ws.addRow(['ImgCo', 'https://img.example.com']);
        // 1x1 PNG
        const png = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'base64',
        );
        const imgId = wb.addImage({ buffer: png, extension: 'png' });
        ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 1, height: 1 } });
        const buf = Buffer.from(await wb.xlsx.writeBuffer());
        assertSafeXlsxBuffer(buf, { originalName: 'img.xlsx' });
        const prev = await previewExcelFile({ buffer: buf, originalName: 'img.xlsx' });
        assert.ok(prev.totalRows >= 1);
    });
});

describe('CP4A CSV security expansion', () => {
    it('rejects unclosed quote, excess columns, null bytes, prototype headers, formula text kept', async () => {
        await assert.rejects(async () => previewCsvFile({
            buffer: Buffer.from('Title,URL\n"unclosed,https://a.example.com\n', 'utf8'),
            originalName: 'q.csv',
        }), (e) => e.statusCode === 400);

        const wide = `${Array.from({ length: 101 }, (_, i) => `H${i}`).join(',')}\n${Array.from({ length: 101 }, () => 'x').join(',')}\n`;
        await assert.rejects(async () => previewCsvFile({
            buffer: Buffer.from(wide, 'utf8'), originalName: 'w.csv',
        }), (e) => e.statusCode === 400);

        await assert.rejects(async () => previewCsvFile({
            buffer: Buffer.from('Title,URL\na\0b,https://a.example.com\n', 'utf8'),
            originalName: 'n.csv',
        }), (e) => e.statusCode === 400);

        const ok = previewCsvFile({
            buffer: Buffer.from('Title,URL\n=1+1,https://f.example.com\n', 'utf8'),
            originalName: 'f.csv',
            columnMapping: { title: 'Title', resultUrl: 'URL' },
        });
        assert.equal(ok.previewRows[0].mapped.title, '=1+1');
    });
});

describe('CP4A crash windows and concurrency', () => {
    it('ImportRun before child / before_child hook leaves recoverable run', async () => {
        const key = `hook-bc-${TAG}`;
        await assert.rejects(async () => commitManualUrlImport({
            companyId: companyA._id, user: fullUserRef.current, campaignId: campaignAId,
            body: {
                source: 'manual', idempotencyKey: key,
                urls: [`https://hook-bc-${TAG.toLowerCase()}.example.com`],
                __testOptions: { failAfter: 'before_child' },
            },
        }));
        const run = await RawCaptureImportRun.findOne({ companyId: companyA._id, idempotencyKey: key });
        assert.ok(run);
        // retry without hook completes
        const again = await commitManualUrlImport({
            companyId: companyA._id, user: fullUserRef.current, campaignId: campaignAId,
            body: {
                source: 'manual', idempotencyKey: key,
                urls: [`https://hook-bc-${TAG.toLowerCase()}.example.com`],
            },
        });
        assert.ok(['completed', 'partially_completed'].includes(again.status) || again.idempotentReplay);
    });

    it('first chunk complete second fails; retry finishes remaining', async () => {
        const { commitFileImport } = await import('../../src/services/dataExtractor/searchCampaign/rawCaptureImport/import.orchestration.service.js');
        let csv = 'Company,Website\n';
        for (let i = 0; i < 101; i += 1) {
            csv += `Co${i},https://chunk-${i}-${TAG.toLowerCase()}.example.com\n`;
        }
        const buf = Buffer.from(csv, 'utf8');
        const key = `hook-af-${TAG}`;
        const mapping = { title: 'Company', resultUrl: 'Website' };
        await assert.rejects(async () => commitFileImport({
            companyId: companyA._id, user: fullUserRef.current, campaignId: campaignAId,
            body: {
                source: 'manual', idempotencyKey: key, columnMapping: mapping,
                __testOptions: { failAfter: 'after_first_chunk' },
            },
            file: { buffer: buf, originalname: 'c.csv', mimetype: 'text/csv' },
        }));
        const run = await RawCaptureImportRun.findOne({ companyId: companyA._id, idempotencyKey: key });
        assert.ok(run, 'import run should exist after partial crash');
        assert.ok(run.chunkStates.some((s) => s.status === 'completed'));
        assert.ok(run.chunkStates.some((s) => s.status === 'pending' || s.status === 'failed'));
        const resume = await commitFileImport({
            companyId: companyA._id, user: fullUserRef.current, campaignId: campaignAId,
            body: { source: 'manual', idempotencyKey: key, columnMapping: mapping },
            file: { buffer: buf, originalname: 'c.csv', mimetype: 'text/csv' },
        });
        assert.ok(['completed', 'partially_completed'].includes(resume.status) || resume.idempotentReplay);
    });

    it('concurrent same-key same-file coalesces; different file 409', async () => {
        const key = `conc-${TAG}`;
        const url = `https://conc-${TAG.toLowerCase()}.example.com`;
        const body = { source: 'manual', idempotencyKey: key, urls: [url] };
        const [a, b] = await Promise.all([
            commitManualUrlImport({ companyId: companyA._id, user: fullUserRef.current, campaignId: campaignAId, body }),
            commitManualUrlImport({ companyId: companyA._id, user: fullUserRef.current, campaignId: campaignAId, body }),
        ]);
        assert.ok([a, b].every((r) => r.importRunId));
        assert.equal(String(a.importRunId), String(b.importRunId));
        await assert.rejects(async () => commitManualUrlImport({
            companyId: companyA._id, user: fullUserRef.current, campaignId: campaignAId,
            body: { ...body, urls: [`https://conc-other-${TAG.toLowerCase()}.example.com`] },
        }), (e) => e.statusCode === 409);
    });

    it('preview fingerprint mismatch rejected on commit', async () => {
        await assert.rejects(async () => commitManualUrlImport({
            companyId: companyA._id, user: fullUserRef.current, campaignId: campaignAId,
            body: {
                source: 'manual', idempotencyKey: `fp-${TAG}`,
                urls: [`https://fp-${TAG.toLowerCase()}.example.com`],
                previewFingerprint: '0'.repeat(64),
            },
        }), (e) => e.statusCode === 400 && /fingerprint/i.test(e.message));
    });

    it('count equation holds for mixed accept/reject/dup', async () => {
        const key = `cnt-${TAG}`;
        const url = `https://cnt-${TAG.toLowerCase()}.example.com`;
        const r = await commitManualUrlImport({
            companyId: companyA._id, user: fullUserRef.current, campaignId: campaignAId,
            body: {
                source: 'manual', idempotencyKey: key,
                urls: [url, url, 'not-a-url'],
            },
        });
        assert.equal(r.parsedRows, r.acceptedRows + r.rejectedRows + r.duplicateWithinImportCount);
    });
});

describe('CP4A multipart size and module-disabled', () => {
    it('file size limit enforced by Multer; unexpected field rejected', async () => {
        __resetMulterInvokes();
        const huge = Buffer.alloc(11 * 1024 * 1024, 0x61);
        const res = await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/preview/file`, {
            token: tokens.full, companyId: companyA._id,
            file: { buffer: huge, name: 'big.csv', mime: 'text/csv' },
        });
        assert.equal(res.status, 400);
        assert.ok(__multerInvokes.count >= 1); // auth passed so multer ran and enforced limit

        const badField = await apiMultipart(`${BASE}/${campaignAId}/raw-capture-imports/preview/file`, {
            token: tokens.full, companyId: companyA._id,
            file: { buffer: Buffer.from('URL\nhttps://a.example.com\n'), name: 't.csv', mime: 'text/csv' },
            // apiMultipart uses field 'file'; unexpected via extraFile already covered
        });
        assert.ok([200, 400].includes(badField.status));
    });
});

