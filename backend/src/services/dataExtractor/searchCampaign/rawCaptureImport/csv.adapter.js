import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import { ApiError } from '../../../../utils/ApiError.js';
import {
    RAW_CAPTURE_SNIPPET_MAX,
    RAW_CAPTURE_TITLE_MAX,
    RAW_CAPTURE_URL_MAX,
} from '../rawCapture/constants.js';
import {
    IMPORT_CSV_MAX_CELL_SIZE,
    IMPORT_CSV_MAX_RECORD_SIZE,
    IMPORT_MAX_COLUMNS,
    IMPORT_MAX_ROWS,
    IMPORT_PREVIEW_ROWS,
} from './constants.js';
import { assertSafeCsvBuffer, sanitizeDisplayFileName, sha256Buffer } from './fileSecurity.util.js';
import { analyzeHeaders, applyMapping, suggestMapping, validateColumnMapping } from './mapping.util.js';

function detectDelimiter(sample) {
    const first = String(sample || '').split(/\r?\n/).find((l) => l.trim()) || '';
    const counts = { ',': 0, ';': 0, '\t': 0 };
    for (const c of Object.keys(counts)) {
        const re = c === '\t' ? /\t/g : new RegExp(`\\${c}`, 'g');
        counts[c] = (first.match(re) || []).length;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
}

function decodeCsvText(buffer) {
    // UTF-8 / UTF-8 BOM only in Checkpoint 4 (safe). Reject obvious non-UTF8 replacement-heavy decode.
    let text = buffer.toString('utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    // If many replacement chars, encoding unsupported
    const sample = text.slice(0, 4000);
    const bad = (sample.match(/\uFFFD/g) || []).length;
    if (bad > 5) throw new ApiError(400, 'CSV encoding is not supported; use UTF-8');
    return { text, encoding: 'utf-8' };
}

function cellToString(v) {
    if (v == null) return '';
    return String(v);
}

export function previewCsvFile({
    buffer,
    originalName = '',
    mimeType = '',
    hasHeader = true,
    delimiter = null,
    columnMapping = null,
} = {}) {
    assertSafeCsvBuffer(buffer, { declaredMime: mimeType, originalName });
    const displayName = sanitizeDisplayFileName(originalName || 'import.csv');
    const fileSha256 = sha256Buffer(buffer);
    const { text, encoding } = decodeCsvText(buffer);
    const detectedDelimiter = delimiter || detectDelimiter(text);

    let records;
    try {
        records = parse(text, {
            delimiter: detectedDelimiter,
            relax_column_count: false,
            skip_empty_lines: true,
            relax_quotes: false,
            bom: true,
            trim: true,
            max_record_size: IMPORT_CSV_MAX_RECORD_SIZE,
            columns: false,
            cast: false,
            comment: undefined,
        });
    } catch (e) {
        throw new ApiError(400, `Malformed CSV: ${String(e?.message || 'parse error').slice(0, 200)}`);
    }

    if (!Array.isArray(records) || !records.length) throw new ApiError(400, 'CSV has no rows');
    if (records[0].length > IMPORT_MAX_COLUMNS) {
        throw new ApiError(400, `CSV may not exceed ${IMPORT_MAX_COLUMNS} columns`);
    }

    let headers;
    let dataRows;
    if (hasHeader !== false) {
        headers = records[0].map((h, i) => {
            const s = cellToString(h).trim();
            return s || `column_${i + 1}`;
        });
        dataRows = records.slice(1);
    } else {
        const width = Math.max(...records.map((r) => r.length));
        headers = Array.from({ length: width }, (_, i) => `column_${i + 1}`);
        dataRows = records;
    }

    if (dataRows.length > IMPORT_MAX_ROWS) {
        throw new ApiError(400, `CSV may not exceed ${IMPORT_MAX_ROWS} data rows`);
    }

    for (const h of headers) {
        const low = String(h).trim().toLowerCase();
        if (low === '__proto__' || low === 'constructor' || low === 'prototype') {
            throw new ApiError(400, `Unsafe CSV header rejected: ${h}`);
        }
        if (String(h).includes('\0')) throw new ApiError(400, 'CSV header contains null byte');
    }
    // Enforce cell length early on preview sample
    for (const row of dataRows.slice(0, Math.min(dataRows.length, IMPORT_PREVIEW_ROWS + 5))) {
        for (const cell of row) {
            if (String(cell ?? '').length > IMPORT_CSV_MAX_CELL_SIZE) {
                throw new ApiError(400, 'CSV cell exceeds maximum length');
            }
        }
    }
    const headerInfo = analyzeHeaders(headers);
    if (headerInfo.duplicates.length) {
        // reported in warnings; commit requires explicit selection of original labels
    }

    const suggested = suggestMapping(headers);
    const mapping = columnMapping
        ? validateColumnMapping(columnMapping, headers)
        : null;

    const previewRows = [];
    let invalid = 0;
    for (let i = 0; i < Math.min(dataRows.length, IMPORT_PREVIEW_ROWS); i += 1) {
        const cells = dataRows[i];
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = cellToString(cells[idx] ?? ''); });
        // Enforce cell length on mapped-ish fields
        for (const [k, v] of Object.entries(obj)) {
            if (v.length > Math.max(RAW_CAPTURE_SNIPPET_MAX, RAW_CAPTURE_URL_MAX, RAW_CAPTURE_TITLE_MAX)) {
                invalid += 1;
            }
        }
        const mapped = mapping ? applyMapping(obj, mapping) : obj;
        previewRows.push({
            rowNumber: (hasHeader !== false ? 2 : 1) + i,
            values: obj,
            mapped,
        });
    }

    // Count blank-ish
    const nonBlank = dataRows.filter((r) => r.some((c) => String(c || '').trim()));
    const contentHash = fileSha256;

    return {
        adapterType: 'csv',
        file: {
            originalFileName: displayName,
            sanitizedFileName: displayName,
            fileExtension: 'csv',
            fileMimeType: mimeType || 'text/csv',
            fileSize: buffer.length,
            fileSha256,
        },
        detectedDelimiter,
        detectedEncoding: encoding,
        hasHeader: hasHeader !== false,
        availableColumns: headers,
        normalizedColumns: headerInfo.normalized,
        duplicateHeaders: headerInfo.duplicates,
        suggestedMapping: suggested,
        columnMapping: mapping,
        totalRows: nonBlank.length,
        previewRows,
        invalidRowCount: invalid,
        contentHash,
        previewFingerprint: crypto.createHash('sha256')
            .update(JSON.stringify({
                fileSha256, detectedDelimiter, hasHeader: hasHeader !== false, mapping: mapping || suggested,
            }))
            .digest('hex'),
        warnings: headerInfo.duplicates.length
            ? ['Duplicate normalized headers detected; select columns explicitly']
            : [],
        _rows: nonBlank.map((cells, idx) => {
            const obj = {};
            headers.forEach((h, cidx) => { obj[h] = cellToString(cells[cidx] ?? ''); });
            return { rowNumber: (hasHeader !== false ? 2 : 1) + idx, values: obj };
        }),
        _headers: headers,
    };
}

export function parseCsvForCommit(args) {
    if (!args?.columnMapping) throw new ApiError(400, 'columnMapping is required for CSV commit');
    const preview = previewCsvFile(args);
    const mapping = validateColumnMapping(args.columnMapping, preview._headers);
    const records = [];
    const errors = [];
    for (const row of preview._rows) {
        const mapped = applyMapping(row.values, mapping);
        // formula-like kept as plain text
        for (const k of Object.keys(mapped)) {
            if (mapped[k] == null) mapped[k] = '';
            else mapped[k] = String(mapped[k]);
            const max = k === 'snippet' ? RAW_CAPTURE_SNIPPET_MAX
                : k === 'resultUrl' ? RAW_CAPTURE_URL_MAX
                    : RAW_CAPTURE_TITLE_MAX;
            if (mapped[k].length > max) {
                errors.push({
                    rowNumber: row.rowNumber,
                    field: k,
                    code: 'CELL_TOO_LONG',
                    message: `${k} exceeds maximum length`,
                });
                mapped.__invalid = true;
            }
        }
        if (!mapped.__invalid) {
            delete mapped.__invalid;
            records.push({ rowNumber: row.rowNumber, record: mapped });
        }
    }
    return { ...preview, columnMapping: mapping, commitRecords: records, parseErrors: errors };
}
