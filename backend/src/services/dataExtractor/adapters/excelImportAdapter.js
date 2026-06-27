import ExcelJS from 'exceljs';
import { mapExcelRowToLead, scoreExtractorConfidence } from '../extractor.utils.js';

async function parseCsvLines(text) {
    const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        const row = {};
        headers.forEach((h, idx) => { row[h] = cols[idx] ?? ''; });
        rows.push(row);
    }
    return rows;
}

async function parseExcelBuffer(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const headers = [];
    sheet.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber] = String(cell.value ?? '').trim();
    });
    const rows = [];
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const obj = {};
        row.eachCell((cell, colNumber) => {
            const key = headers[colNumber];
            if (key) obj[key] = cell.value != null ? String(cell.value).trim() : '';
        });
        if (Object.values(obj).some((v) => v)) rows.push(obj);
    });
    return rows;
}

/**
 * Phase 1 Excel/CSV import adapter — no web fetch.
 */
export async function runExcelImportAdapter({ buffer, fileName = '', columnMapping = {} }) {
    const ext = (fileName || '').toLowerCase();
    let rows = [];
    if (ext.endsWith('.csv')) {
        rows = await parseCsvLines(buffer.toString('utf8'));
    } else {
        rows = await parseExcelBuffer(buffer);
    }

    const records = [];
    const errors = [];
    const platform = ext.endsWith('.csv') ? 'csv_import' : 'excel_import';

    rows.forEach((row, idx) => {
        try {
            const mapped = mapExcelRowToLead(row, columnMapping);
            if (!mapped.companyName && !mapped.website && !mapped.email) {
                errors.push(`Row ${idx + 2}: no company name, website, or email`);
                return;
            }
            const fields = {
                ...mapped,
                companyName: mapped.companyName || mapped.website || mapped.email,
                sourcePlatform: platform,
                sourceUrl: mapped.sourceUrl || mapped.website || '',
                extractedAt: new Date(),
            };
            fields.confidenceScore = scoreExtractorConfidence(fields);
            fields.rawExtractedData = { importRow: row };
            records.push(fields);
        } catch (e) {
            errors.push(`Row ${idx + 2}: ${e?.message || 'parse error'}`);
        }
    });

    return { records, errors, rowCount: rows.length };
}
