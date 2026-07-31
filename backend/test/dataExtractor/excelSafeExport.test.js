/**
 * Excel-safe export sanitizer + All Current Data workbook validation.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
    EXCEL_MAX_CELL_CHARS,
    EXCEL_SHORTEN_SUFFIX,
    excelSafeCellValue,
    excelSafeHyperlinkUrl,
    excelSafeUrlCell,
    safeExcelSheetName,
    stripInvalidXmlChars,
    truncateForExcelCell,
    validateGeneratedXlsxBuffer,
} from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/excelSafeValue.util.js';
import { buildAllCurrentCapturedDataWorkbook } from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.capturedData.export.service.js';

describe('excelSafeValue.util', () => {
    it('strips XML-illegal controls and non-characters but keeps tabs/LF/Unicode', () => {
        const raw = `ok\tline\n\u0000\u0007\u000B\uFFFE\uFFFFગુજરાતી हिंदी 😀`;
        const out = stripInvalidXmlChars(raw);
        assert.equal(out.includes('\u0000'), false);
        assert.equal(out.includes('\uFFFE'), false);
        assert.equal(out.includes('\uFFFF'), false);
        assert.ok(out.includes('\t'));
        assert.ok(out.includes('\n'));
        assert.ok(out.includes('ગુજરાતી'));
        assert.ok(out.includes('हिंदी'));
        assert.ok(out.includes('😀'));
    });

    it('truncates long cells with Excel suffix', () => {
        const long = 'x'.repeat(40000);
        const out = truncateForExcelCell(long);
        assert.ok(out.length <= EXCEL_MAX_CELL_CHARS);
        assert.ok(out.endsWith(EXCEL_SHORTEN_SUFFIX));
    });

    it('guards formula injection and keeps phones as text', () => {
        assert.equal(excelSafeCellValue('=SUM(1,1)', { forceText: true }), "'=SUM(1,1)");
        assert.equal(excelSafeCellValue('+919876543210', { forceText: true }), "'+919876543210");
        assert.equal(excelSafeCellValue('-1 discounted', { forceText: true }), "'-1 discounted");
        assert.equal(excelSafeCellValue('@mention', { forceText: true }), "'@mention");
        assert.equal(excelSafeCellValue(42), 42);
        assert.equal(excelSafeCellValue(true), 'Yes');
        assert.equal(excelSafeCellValue(null), '');
        assert.equal(excelSafeCellValue(Number.NaN), '');
        assert.equal(excelSafeCellValue([1, 'a', null]), '1; a');
        assert.match(String(excelSafeCellValue({ a: 1, b: { nested: true } })), /a=1/);
        assert.equal(String(excelSafeCellValue({ a: 1, b: { nested: true } })).includes('[object Object]'), false);
    });

    it('only creates http(s) hyperlinks', () => {
        assert.ok(excelSafeHyperlinkUrl('https://example.com/path'));
        assert.equal(excelSafeHyperlinkUrl('javascript:alert(1)'), null);
        assert.equal(excelSafeHyperlinkUrl('not a url'), null);
        assert.equal(excelSafeHyperlinkUrl(`https://example.com/${'a'.repeat(3000)}`), null);
        const cell = excelSafeUrlCell('https://safe.example/x');
        assert.equal(typeof cell, 'object');
        assert.equal(cell.hyperlink, 'https://safe.example/x');
        assert.equal(typeof excelSafeUrlCell('ftp://nope.example'), 'string');
    });

    it('makes unique safe sheet names', () => {
        const used = new Set();
        const a = safeExcelSheetName('All Captured Records', used);
        const b = safeExcelSheetName('All Captured Records', used);
        const c = safeExcelSheetName('Bad\\Name/With?*[chars]:', used);
        assert.equal(a, 'All Captured Records');
        assert.notEqual(a, b);
        assert.equal(c.includes('\\'), false);
        assert.equal(c.includes('/'), false);
        assert.ok(c.length <= 31);
    });
});

describe('buildAllCurrentCapturedDataWorkbook adversarial + validation', () => {
    it('exports adversarial rows without invalid XML and reloads in ExcelJS', async () => {
        const longSnippet = `A${'字'.repeat(40000)}`;
        const rows = [
            {
                index: 1,
                companyName: '=\u0001Evil Co',
                website: 'javascript:alert(1)',
                phone: '+919876543210',
                whatsapp: '+919876543210',
                email: 'a@b.com',
                productsServices: `\uFFFF\uFFFEh2; classfont_2span; ${longSnippet}`,
                failureReason: null,
                facebook: { nested: true },
                linkedin: ['https://linkedin.com/in/x', '\u0008'],
                exclusiveStatus: 'waiting',
                flags: { hasEnrichDone: true },
                retryAvailable: false,
                retryCount: 0,
                relevanceScore: Number.NaN,
            },
            {
                index: 2,
                companyName: 'Normal Co',
                website: 'https://example.com',
                sourceUrl: 'https://example.com',
                productsServices: 'ok',
                exclusiveStatus: 'failed',
                flags: {},
                retryCount: 1,
                relevanceScore: 88,
            },
        ];

        const buffer = await buildAllCurrentCapturedDataWorkbook({
            rows,
            campaign: { name: 'Adversarial / Test:*?' },
            session: { status: 'active' },
            tabCounts: {},
            exclusiveBuckets: { total: 2 },
            stageMetrics: {},
            queries: [{ queryText: '+boost query', selectedCriteria: { businessType: 'OEM' } }],
        });

        assert.ok(Buffer.isBuffer(buffer));
        assert.equal(buffer[0], 0x50);
        await validateGeneratedXlsxBuffer(buffer, { expectedSheetCount: 11 });

        const zip = await JSZip.loadAsync(buffer);
        const ss = await zip.file('xl/sharedStrings.xml').async('string');
        assert.equal(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(ss), false);
        assert.ok(ss.includes(EXCEL_SHORTEN_SUFFIX) || ss.includes('Text shortened'));

        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer);
        assert.equal(wb.worksheets.length, 11);
        const all = wb.getWorksheet('All Captured Records');
        assert.ok(all);
        assert.equal(all.rowCount, 3); // header + 2
        // Phone column key after inserted location columns
        const phoneCol = RECORD_COLUMNS_PHONE_HINT(all);
        const phone = String(phoneCol ?? '');
        assert.ok(phone.includes('919876543210'), `phone cell was: ${phone}`);
        assert.match(phone, /\+?'?\+?91/);
    });
});

function RECORD_COLUMNS_PHONE_HINT(sheet) {
    const header = sheet.getRow(1);
    let phoneIdx = 11;
    header.eachCell((cell, col) => {
        if (String(cell.value || '').toLowerCase() === 'phone') phoneIdx = col;
    });
    return sheet.getRow(2).getCell(phoneIdx).value;
}