import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { ApiError } from '../../../../utils/ApiError.js';
import {
    RAW_CAPTURE_SNIPPET_MAX,
    RAW_CAPTURE_TITLE_MAX,
    RAW_CAPTURE_URL_MAX,
} from '../rawCapture/constants.js';
import {
    IMPORT_MAX_COLUMNS,
    IMPORT_MAX_ROWS,
    IMPORT_PREVIEW_ROWS,
    IMPORT_XLSX_MAX_SHEETS,
} from './constants.js';
import {
    assertSafeXlsxBuffer,
    sanitizeDisplayFileName,
    sha256Buffer,
    __xlsxPreflight,
} from './fileSecurity.util.js';
import { analyzeHeaders, applyMapping, suggestMapping, validateColumnMapping } from './mapping.util.js';

/** Test instrumentation: increments only when ExcelJS load runs. */
export const __excelJsLoad = { count: 0 };

function cellDisplayValue(cell) {
    if (!cell) return { value: '', formula: false, hasCached: true, kind: 'empty' };
    const v = cell.value;
    if (v == null) return { value: '', formula: false, hasCached: true, kind: 'empty' };
    if (typeof v === 'object' && v.formula != null) {
        if (v.result != null && typeof v.result !== 'object') {
            return { value: String(v.result), formula: true, hasCached: true, kind: 'formula' };
        }
        if (v.result != null && v.result instanceof Date) {
            return { value: v.result.toISOString(), formula: true, hasCached: true, kind: 'formula' };
        }
        if (v.sharedFormula != null) {
            const text = cell.text != null ? String(cell.text) : '';
            if (text && !text.startsWith('=')) {
                return { value: text, formula: true, hasCached: true, kind: 'sharedFormula' };
            }
            return { value: '', formula: true, hasCached: false, kind: 'sharedFormula' };
        }
        const text = cell.text != null ? String(cell.text) : '';
        if (text && !text.startsWith('=')) {
            return { value: text, formula: true, hasCached: true, kind: 'formula' };
        }
        return { value: '', formula: true, hasCached: false, kind: 'formula' };
    }
    if (typeof v === 'object' && v.sharedFormula != null) {
        if (v.result != null && typeof v.result !== 'object') {
            return { value: String(v.result), formula: true, hasCached: true, kind: 'sharedFormula' };
        }
        return { value: '', formula: true, hasCached: false, kind: 'sharedFormula' };
    }
    if (v instanceof Date) return { value: v.toISOString(), formula: false, hasCached: true, kind: 'date' };
    if (typeof v === 'object' && v.text != null) return { value: String(v.text), formula: false, hasCached: true, kind: 'text' };
    if (typeof v === 'object' && v.richText) {
        return { value: v.richText.map((t) => t.text || '').join(''), formula: false, hasCached: true, kind: 'richText' };
    }
    if (typeof v === 'object' && v.hyperlink) {
        const href = String(v.hyperlink || '');
        if (/^(file|\\\\|\/\/)/i.test(href) || /[a-z]:\\/i.test(href)) {
            return { value: '', formula: false, hasCached: false, kind: 'externalLink' };
        }
        return { value: String(v.text || v.hyperlink || ''), formula: false, hasCached: true, kind: 'hyperlink' };
    }
    return { value: String(v), formula: false, hasCached: true, kind: 'value' };
}

export async function previewExcelFile({
    buffer,
    originalName = '',
    mimeType = '',
    sheetName = null,
    hasHeader = true,
    columnMapping = null,
} = {}) {
    assertSafeXlsxBuffer(buffer, { declaredMime: mimeType, originalName });
    if (!__xlsxPreflight.lastPassed) {
        throw new ApiError(400, 'Excel preflight did not pass');
    }
    const displayName = sanitizeDisplayFileName(originalName || 'import.xlsx');
    const fileSha256 = sha256Buffer(buffer);

    const workbook = new ExcelJS.Workbook();
    __excelJsLoad.count += 1;
    await workbook.xlsx.load(buffer);

    if ((workbook.worksheets || []).length > IMPORT_XLSX_MAX_SHEETS) {
        throw new ApiError(400, `Workbook may not exceed ${IMPORT_XLSX_MAX_SHEETS} worksheets`);
    }

    const visible = workbook.worksheets.filter((ws) => ws.state !== 'hidden' && ws.state !== 'veryHidden');
    const availableSheets = visible.map((ws) => ws.name);
    if (!availableSheets.length) throw new ApiError(400, 'No visible worksheets found');

    let sheet;
    if (sheetName) {
        sheet = visible.find((ws) => ws.name === sheetName);
        if (!sheet) throw new ApiError(400, `Worksheet not found or hidden: ${sheetName}`);
    } else {
        sheet = visible[0];
    }

    const maxCol = Math.min(sheet.actualColumnCount || sheet.columnCount || 0, IMPORT_MAX_COLUMNS + 1);
    if ((sheet.actualColumnCount || 0) > IMPORT_MAX_COLUMNS) {
        throw new ApiError(400, `Excel may not exceed ${IMPORT_MAX_COLUMNS} columns`);
    }

    const matrix = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (matrix.length > IMPORT_MAX_ROWS + 5) return;
        const cells = [];
        let formulaMissing = false;
        let externalLink = false;
        for (let c = 1; c <= maxCol; c += 1) {
            const cell = row.getCell(c);
            const dv = cellDisplayValue(cell);
            if (dv.formula && !dv.hasCached) formulaMissing = true;
            if (dv.kind === 'externalLink') externalLink = true;
            cells.push(dv.value);
        }
        if (cells.some((v) => String(v || '').trim())) {
            matrix.push({ rowNumber, cells, formulaMissing, externalLink });
        }
    });

    if (!matrix.length) throw new ApiError(400, 'Excel sheet has no data rows');
    if (matrix.length > IMPORT_MAX_ROWS + 1) {
        throw new ApiError(400, `Excel may not exceed ${IMPORT_MAX_ROWS} data rows`);
    }

    let headers;
    let dataRows;
    if (hasHeader !== false) {
        headers = matrix[0].cells.map((h, i) => {
            const s = String(h || '').trim();
            return s || `column_${i + 1}`;
        });
        dataRows = matrix.slice(1);
    } else {
        const width = Math.max(...matrix.map((r) => r.cells.length));
        headers = Array.from({ length: width }, (_, i) => `column_${i + 1}`);
        dataRows = matrix;
    }

    if (dataRows.length > IMPORT_MAX_ROWS) {
        throw new ApiError(400, `Excel may not exceed ${IMPORT_MAX_ROWS} data rows`);
    }

    const headerInfo = analyzeHeaders(headers);
    const suggested = suggestMapping(headers);
    const mapping = columnMapping ? validateColumnMapping(columnMapping, headers) : null;

    const previewRows = dataRows.slice(0, IMPORT_PREVIEW_ROWS).map((r) => {
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = r.cells[idx] ?? ''; });
        return {
            rowNumber: r.rowNumber,
            sheetName: sheet.name,
            values: obj,
            mapped: mapping ? applyMapping(obj, mapping) : obj,
            formulaMissingCache: r.formulaMissing,
            externalLinkBlocked: r.externalLink,
        };
    });

    return {
        adapterType: 'excel_xlsx',
        file: {
            originalFileName: displayName,
            sanitizedFileName: displayName,
            fileExtension: 'xlsx',
            fileMimeType: mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            fileSize: buffer.length,
            fileSha256,
        },
        availableSheets,
        sheetName: sheet.name,
        hasHeader: hasHeader !== false,
        availableColumns: headers,
        normalizedColumns: headerInfo.normalized,
        duplicateHeaders: headerInfo.duplicates,
        suggestedMapping: suggested,
        columnMapping: mapping,
        totalRows: dataRows.length,
        previewRows,
        contentHash: fileSha256,
        previewFingerprint: crypto.createHash('sha256')
            .update(JSON.stringify({
                fileSha256, sheet: sheet.name, hasHeader: hasHeader !== false, mapping: mapping || suggested,
            }))
            .digest('hex'),
        warnings: headerInfo.duplicates.length
            ? ['Duplicate normalized headers detected; select columns explicitly']
            : [],
        _rows: dataRows.map((r) => {
            const obj = {};
            headers.forEach((h, idx) => { obj[h] = r.cells[idx] ?? ''; });
            return {
                rowNumber: r.rowNumber,
                sheetName: sheet.name,
                values: obj,
                formulaMissing: r.formulaMissing,
                externalLink: r.externalLink,
            };
        }),
        _headers: headers,
    };
}

export async function parseExcelForCommit(args) {
    if (!args?.columnMapping) throw new ApiError(400, 'columnMapping is required for Excel commit');
    const preview = await previewExcelFile(args);
    const mapping = validateColumnMapping(args.columnMapping, preview._headers);
    const records = [];
    const errors = [];
    for (const row of preview._rows) {
        if (row.externalLink) {
            errors.push({
                rowNumber: row.rowNumber,
                sheetName: row.sheetName,
                field: 'resultUrl',
                code: 'EXTERNAL_LINK',
                message: 'External/file link is not allowed',
            });
            continue;
        }
        if (row.formulaMissing) {
            errors.push({
                rowNumber: row.rowNumber,
                sheetName: row.sheetName,
                field: 'resultUrl',
                code: 'FORMULA_NO_CACHE',
                message: 'Formula cell has no safe cached value',
            });
            continue;
        }
        const mapped = applyMapping(row.values, mapping);
        let bad = false;
        for (const k of Object.keys(mapped)) {
            mapped[k] = mapped[k] == null ? '' : String(mapped[k]);
            const max = k === 'snippet' ? RAW_CAPTURE_SNIPPET_MAX
                : k === 'resultUrl' ? RAW_CAPTURE_URL_MAX
                    : RAW_CAPTURE_TITLE_MAX;
            if (mapped[k].length > max) {
                errors.push({
                    rowNumber: row.rowNumber,
                    sheetName: row.sheetName,
                    field: k,
                    code: 'CELL_TOO_LONG',
                    message: `${k} exceeds maximum length`,
                });
                bad = true;
            }
        }
        if (!bad) records.push({ rowNumber: row.rowNumber, sheetName: row.sheetName, record: mapped });
    }
    return { ...preview, columnMapping: mapping, commitRecords: records, parseErrors: errors };
}
