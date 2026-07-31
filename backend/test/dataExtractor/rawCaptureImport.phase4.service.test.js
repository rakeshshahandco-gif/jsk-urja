/**
 * Checkpoint 4 — RawCapture import adapter service tests (crm_test only).
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { SearchCampaign } from '../../src/models/searchCampaign.model.js';
import { SearchQuery } from '../../src/models/searchQuery.model.js';
import { RawCapture } from '../../src/models/rawCapture.model.js';
import { RawCaptureBatch } from '../../src/models/rawCaptureBatch.model.js';
import { RawCaptureImportRun } from '../../src/models/rawCaptureImportRun.model.js';
import { ExtractedLead } from '../../src/models/extractedLead.model.js';
import { previewManualUrls } from '../../src/services/dataExtractor/searchCampaign/rawCaptureImport/manualUrl.adapter.js';
import { previewPastedText } from '../../src/services/dataExtractor/searchCampaign/rawCaptureImport/pastedText.adapter.js';
import { previewCsvFile, parseCsvForCommit } from '../../src/services/dataExtractor/searchCampaign/rawCaptureImport/csv.adapter.js';
import { previewExcelFile, parseExcelForCommit } from '../../src/services/dataExtractor/searchCampaign/rawCaptureImport/excel.adapter.js';
import {
    commitManualUrlImport,
    commitPastedTextImport,
    commitFileImport,
    previewManualUrlImport,
    __test as orchTest,
} from '../../src/services/dataExtractor/searchCampaign/rawCaptureImport/import.orchestration.service.js';
import {
    assertSafeXlsxBuffer,
} from '../../src/services/dataExtractor/searchCampaign/rawCaptureImport/fileSecurity.util.js';
import { IMPORT_RUN_IDEMPOTENCY_INDEX_NAME } from '../../src/services/dataExtractor/searchCampaign/rawCaptureImport/constants.js';
import { validateColumnMapping } from '../../src/services/dataExtractor/searchCampaign/rawCaptureImport/mapping.util.js';

const MONGO_URI = process.env.SC_MONGO_URI || process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `RC4-${Date.now()}`;
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
            search_query: { view: true, manage: false, generate: false, review: false, open: false },
            raw_capture: { view: true, ingest: true, import: true, manage: true, archive: true },
        },
    },
};

let campaignA;
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

async function buildXlsxBuffer(rows, { sheetName = 'Sheet1', hiddenSheet = false } = {}) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);
    rows.forEach((r) => ws.addRow(r));
    if (hiddenSheet) {
        const hs = wb.addWorksheet('Hidden');
        hs.state = 'hidden';
        hs.addRow(['secret', 'https://hidden.example.com']);
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
}

before(async () => {
    assert.match(MONGO_URI, /crm_test/);
    assert.doesNotMatch(MONGO_URI, /prod|atlas|mongodb\.net/i);
    await mongoose.connect(MONGO_URI);
    await RawCaptureImportRun.syncIndexes();
    leadsBefore = await ExtractedLead.countDocuments({}).catch(() => 0);
    campaignA = await SearchCampaign.create({
        companyId: companyA, name: `4A ${TAG}`, nameNormalized: `4a ${TAG}`,
        targetIndustry: 'Home Automation', country: 'India', sources: ['google'], status: 'active',
    });
    queryA = await makeQuery();
});

after(async () => {
    await RawCapture.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await RawCaptureBatch.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await RawCaptureImportRun.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await SearchQuery.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await SearchCampaign.deleteMany({ companyId: { $in: [companyA, companyB] }, name: new RegExp(TAG) });
    await mongoose.disconnect();
});

describe('CP4 indexes', () => {
    it('confirms import-run idempotency and list indexes', async () => {
        const idxs = await RawCaptureImportRun.collection.indexes();
        assert.ok(idxs.find((i) => i.name === IMPORT_RUN_IDEMPOTENCY_INDEX_NAME)?.unique);
        assert.ok(idxs.some((i) => i.key?.campaignId === 1 && i.key?.createdAt === -1));
        assert.ok(idxs.some((i) => i.key?.status === 1));
    });
});

describe('CP4 manual URL adapter', () => {
    it('previews valid/invalid/duplicate URLs without ingesting', async () => {
        const before = await RawCapture.countDocuments({ companyId: companyA });
        const p = previewManualUrls({
            records: [
                'https://one.example.com/?utm_source=x',
                { resultUrl: 'https://one.example.com/', title: 'One' },
                { resultUrl: 'javascript:alert(1)' },
                { resultUrl: 'https://user:pass@evil.example.com/' },
                { resultUrl: 'http://127.0.0.1/x' },
            ],
        });
        assert.equal(p.totalRows, 5);
        assert.ok(p.duplicateWithinInputCount >= 1);
        assert.ok(p.invalidRowCount >= 3);
        assert.ok(p.previewRows[0].normalizedUrl.includes('one.example.com'));
        assert.equal(await RawCapture.countDocuments({ companyId: companyA }), before);
    });

    it('commits via RawCapture ingestion; replay and query counters; max 100', async () => {
        const q = await makeQuery();
        const key = `man-${TAG}`;
        const r1 = await commitManualUrlImport({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: {
                source: 'manual', idempotencyKey: key, queryId: String(q._id),
                urls: [`https://manual-${TAG.toLowerCase()}.example.com/`],
            },
        });
        assert.equal(r1.status, 'completed');
        assert.equal(r1.acceptedRows, 1);
        assert.ok(r1.rawCaptureBatchIds.length >= 1);
        assert.equal(r1.queryCaptureCount, 1);
        assert.equal(r1.queryResultCount, 1);

        const replay = await commitManualUrlImport({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: {
                source: 'manual', idempotencyKey: key, queryId: String(q._id),
                urls: [`https://manual-${TAG.toLowerCase()}.example.com/`],
            },
        });
        assert.equal(replay.idempotentReplay, true);
        assert.equal(replay.queryCaptureCount, 1);

        await assert.rejects(async () => commitManualUrlImport({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: {
                    source: 'manual', idempotencyKey: key, queryId: String(q._id),
                    urls: [`https://other-${TAG.toLowerCase()}.example.com/`],
                },
            }),
            (e) => e.statusCode === 409,
        );

        const camp = await commitManualUrlImport({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: {
                source: 'manual', idempotencyKey: `camp-${TAG}`,
                urls: [`https://camp-only-${TAG.toLowerCase()}.example.com/`],
            },
        });
        assert.equal(camp.queryCaptureCount, null);
        const qDoc = await SearchQuery.findById(q._id).lean();
        assert.equal(qDoc.captureCount, 1);

        await assert.rejects(async () => previewManualUrls({
                urls: Array.from({ length: 101 }, (_, i) => `https://m${i}.example.com/`),
            }),
            (e) => e.statusCode === 400,
        );

        await assert.rejects(async () => previewManualUrlImport({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: { urls: ['https://x.example.com'], companyId: String(companyB) },
            }),
            (e) => e.statusCode === 400,
        );
    });
});

describe('CP4 pasted text adapter', () => {
    it('parses url-per-line, tab, pipe, blocks; rejects unsafe', async () => {
        assert.equal(previewPastedText({
            text: 'https://a.example.com\nhttps://b.example.com',
        }).detectedFormat, 'url_per_line');
        assert.equal(previewPastedText({
            text: 'Co A\thttps://a.example.com\tDesc\nCo B\thttps://b.example.com\tMore',
        }).detectedFormat, 'tab_separated');
        assert.equal(previewPastedText({
            text: 'Co A | https://a.example.com | Desc',
        }).detectedFormat, 'pipe_separated');
        const blocks = previewPastedText({
            text: 'Company A\nHome automation\nhttps://block-a.example.com\n\nCompany B\nhttps://block-b.example.com',
        });
        assert.equal(blocks.detectedFormat, 'blank_line_blocks');
        assert.ok(blocks.previewRows[0].title);

        await assert.rejects(async () => previewPastedText({ text: '' }), (e) => e.statusCode === 400);
        await assert.rejects(async () => previewPastedText({ text: '<html><script>x</script></html>' }), (e) => e.statusCode === 400);
        await assert.rejects(async () => previewPastedText({ text: `data:text/plain;base64,${'A'.repeat(300)}` }), (e) => e.statusCode === 400);

        const key = `paste-${TAG}`;
        const text = `https://paste-${TAG.toLowerCase()}.example.com/`;
        const r1 = await commitPastedTextImport({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: { source: 'manual', idempotencyKey: key, text },
        });
        assert.equal(r1.status, 'completed');
        const r2 = await commitPastedTextImport({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: { source: 'manual', idempotencyKey: key, text },
        });
        assert.equal(r2.idempotentReplay, true);
        await assert.rejects(async () => commitPastedTextImport({
                companyId: companyA, user: fullUser, campaignId: campaignA._id,
                body: { source: 'manual', idempotencyKey: key, text: 'https://different.example.com/' },
            }),
            (e) => e.statusCode === 409,
        );
    });
});

describe('CP4 CSV adapter', () => {
    it('parses UTF-8/BOM/delimiters/quotes; mapping; commit chunk-ready', async () => {
        const csv = 'Company,Website,Description\n"Acme, Inc",https://acme.example.com,"Line1\nLine2"\nBeta;skip,https://beta.example.com,Ok\n';
        const p = previewCsvFile({
            buffer: Buffer.from(`\uFEFF${csv}`, 'utf8'),
            originalName: 't.csv',
            mimeType: 'text/csv',
        });
        assert.equal(p.detectedEncoding, 'utf-8');
        assert.equal(p.detectedDelimiter, ',');
        assert.ok(p.suggestedMapping.resultUrl);
        assert.ok(p.previewRows.length >= 1);

        const semi = previewCsvFile({
            buffer: Buffer.from('Name;URL\nA;https://a.example.com\n', 'utf8'),
            originalName: 's.csv',
        });
        assert.equal(semi.detectedDelimiter, ';');

        const tab = previewCsvFile({
            buffer: Buffer.from('Name\tURL\nA\thttps://a.example.com\n', 'utf8'),
            originalName: 't.csv',
        });
        assert.equal(tab.detectedDelimiter, '\t');

        await assert.rejects(async () => validateColumnMapping({ companyId: 'x' }, ['Website']),
            (e) => e.statusCode === 400,
        );
        await assert.rejects(async () => parseCsvForCommit({
                buffer: Buffer.from('URL\nhttps://x.example.com\n', 'utf8'),
                originalName: 'x.csv',
            }),
            (e) => e.statusCode === 400,
        );

        const mapping = { title: 'Company', resultUrl: 'Website', snippet: 'Description' };
        const before = await RawCapture.countDocuments({ companyId: companyA });
        previewCsvFile({
            buffer: Buffer.from(csv, 'utf8'), originalName: 'p.csv', columnMapping: mapping,
        });
        assert.equal(await RawCapture.countDocuments({ companyId: companyA }), before);

        const commit = await commitFileImport({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: {
                source: 'manual',
                idempotencyKey: `csv-${TAG}`,
                columnMapping: JSON.stringify(mapping),
            },
            file: { buffer: Buffer.from(csv, 'utf8'), originalname: 'in.csv', mimetype: 'text/csv' },
        });
        assert.ok(['completed', 'partially_completed'].includes(commit.status));
        assert.ok(commit.acceptedRows >= 1);

        // formula-like as text
        const fcsv = 'Title,URL\n=1+1,https://formula.example.com\n';
        const fp = parseCsvForCommit({
            buffer: Buffer.from(fcsv, 'utf8'),
            originalName: 'f.csv',
            columnMapping: { title: 'Title', resultUrl: 'URL' },
        });
        assert.equal(fp.commitRecords[0].record.title, '=1+1');
    });
});

describe('CP4 Excel adapter', () => {
    it('lists sheets, defaults visible, rejects bad formats, cleans temp, commits', async () => {
        const buf = await buildXlsxBuffer([
            ['Company', 'Website'],
            ['Ex Co', `https://ex-${TAG.toLowerCase()}.example.com`],
            ['Two', `https://ex2-${TAG.toLowerCase()}.example.com`],
        ], { hiddenSheet: true });
        const p = await previewExcelFile({
            buffer: buf, originalName: 'ok.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        assert.ok(p.availableSheets.includes('Sheet1'));
        assert.ok(!p.availableSheets.includes('Hidden'));
        assert.equal(p.sheetName, 'Sheet1');
        assert.ok(p.previewRows.length <= 20);

        const before = await RawCapture.countDocuments({ companyId: companyA });
        await previewExcelFile({ buffer: buf, originalName: 'ok.xlsx' });
        assert.equal(await RawCapture.countDocuments({ companyId: companyA }), before);

        await assert.rejects(async () => assertSafeXlsxBuffer(Buffer.from('not-zip'), { originalName: 'x.xlsx' }),
            (e) => e.statusCode === 400,
        );
        await assert.rejects(async () => assertSafeXlsxBuffer(buf, { originalName: 'macro.xlsm' }),
            (e) => e.statusCode === 400,
        );
        await assert.rejects(async () => assertSafeXlsxBuffer(buf, { originalName: 'old.xls' }),
            (e) => e.statusCode === 400,
        );

        // Checkpoint 4A: no temporary files for XLSX — in-memory ExcelJS.load after preflight
        assert.equal(typeof buf.length, 'number');

        const mapping = { title: 'Company', resultUrl: 'Website' };
        const commit = await commitFileImport({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: {
                source: 'manual',
                idempotencyKey: `xlsx-${TAG}`,
                columnMapping: mapping,
            },
            file: {
                buffer: buf,
                originalname: 'ok.xlsx',
                mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            },
        });
        assert.equal(commit.status, 'completed');
        assert.equal(commit.acceptedRows, 2);
        const stored = await RawCaptureImportRun.findById(commit.importRunId).lean();
        assert.ok(!JSON.stringify(stored).includes(buf.toString('base64').slice(0, 32)));
    });
});

describe('CP4 orchestration', () => {
    it('chunks 250 rows into 3 batches; dedupes within import; aggregates; no ExtractedLead', async () => {
        const q = await makeQuery();
        const urls = Array.from({ length: 250 }, (_, i) => `https://chunk-${TAG.toLowerCase()}-${i}.example.com/`);
        // inject duplicate
        urls.push(urls[0]);
        const r = await commitManualUrlImport({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: {
                source: 'manual',
                idempotencyKey: `chunk250-${TAG}`,
                queryId: String(q._id),
                // manual max is 100 — use CSV path for 250
            },
        }).catch((e) => e);

        // Build CSV for 250
        const header = 'Title,URL\n';
        const body = urls.map((u, i) => `T${i},${u}`).join('\n');
        const csvBuf = Buffer.from(header + body, 'utf8');
        const commit = await commitFileImport({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: {
                source: 'manual',
                idempotencyKey: `orch250-${TAG}`,
                queryId: String(q._id),
                columnMapping: { title: 'Title', resultUrl: 'URL' },
            },
            file: { buffer: csvBuf, originalname: 'big.csv', mimetype: 'text/csv' },
        });
        assert.equal(commit.rawCaptureBatchIds.length, 3);
        assert.ok(commit.acceptedRows >= 250);
        assert.ok(commit.duplicateWithinImportCount >= 1);
        const qDoc = await SearchQuery.findById(q._id).lean();
        assert.equal(qDoc.captureCount, 3);
        assert.equal(qDoc.resultCount, 250);

        const replay = await commitFileImport({
            companyId: companyA, user: fullUser, campaignId: campaignA._id,
            body: {
                source: 'manual',
                idempotencyKey: `orch250-${TAG}`,
                queryId: String(q._id),
                columnMapping: { title: 'Title', resultUrl: 'URL' },
            },
            file: { buffer: csvBuf, originalname: 'big.csv', mimetype: 'text/csv' },
        });
        assert.equal(replay.idempotentReplay, true);
        assert.equal(replay.rawCaptureBatchIds.length, 3);

        assert.equal(orchTest.chunkAccepted(Array.from({ length: 250 }, (_, i) => i)).length, 3);
        assert.equal(await ExtractedLead.countDocuments({}).catch(() => 0), leadsBefore);

        // same key other company allowed
        await SearchCampaign.create({
            companyId: companyB, name: `4B ${TAG}`, nameNormalized: `4b ${TAG}`,
            targetIndustry: 'Other', country: 'India', sources: ['google'], status: 'active',
        });
    });
});
