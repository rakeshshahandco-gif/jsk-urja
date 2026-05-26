import ExcelJS from 'exceljs';

/**
 * GST portal GSTR-2B / GSTR-2A Excel parser.
 *
 * Supports actual GST portal downloaded Excel files which contain:
 *  - Multiple sheets (B2B, B2BA, CDNR, CDNRA, ISD, IMPG, ECO, …)
 *  - Title / instruction rows before the real header row
 *  - GST-portal-specific column names (₹ suffixes, merged cells, etc.)
 *  - IGST / CGST / SGST / Cess as separate columns
 *
 * Return shape for Excel/CSV parse helpers:
 *  {
 *    records      : NormalisedRecord[],   // all valid records across sheets
 *    sheetSummary : SheetResult[],        // per-sheet stats
 *    totalSkipped : number,
 *    errors       : { sheet, rowIndex, reason }[],
 *  }
 */

// ─── Header aliases ───────────────────────────────────────────────────────────
// Each entry maps an internal field name → list of GST-portal column name
// fragments (lower-cased, trimmed, ₹/() stripped) that identify that field.
const HEADER_ALIASES = {
    supplierGstin: [
        // B2B / CDNR / ISD
        'gstin of supplier',
        'gstin of the supplier',
        'supplier gstin',
        'gstin/uin of supplier',
        'gstin/uin',
        'ctin',
        // IMPG — importer's own GSTIN column
        'gstin of importer',
        'gstin of the importer',
        'importer gstin',
        // generic last-resort (short alias kept for exact-match only via isUsableHeaderMap guard)
        'gstin',
    ],
    supplierName: [
        'trade/legal name of the supplier',
        'trade / legal name of the supplier',
        'trade/legal name',
        'trade name',
        'legal name',
        'supplier name',
        'supplier trade name',
        'name of supplier',
    ],
    invoiceNumber: [
        // B2B / CDNR
        'invoice number',
        'document number',
        'invoice no',
        'doc no',
        'note number',
        'debit note number',
        'credit note number',
        // IMPG — bill of entry variants (GST portal uses several formats)
        'bill of entry number',
        'bill of entry no',
        'bill of entry no.',
        'boe number',
        'boe no',
        'b/e number',
        'b/e no',
        'be number',
        'be no',
        'entry number',
        // ISD
        'isd document number',
        'isd document no',
        'isd invoice number',
    ],
    invoiceDate: [
        // B2B / CDNR  (keep specific — do NOT use bare 'date' to avoid false matches)
        'invoice date',
        'document date',
        'doc date',
        'note date',
        'date of invoice',
        // IMPG
        'bill of entry date',
        'boe date',
        'b/e date',
        'be date',
        'entry date',
        // ISD
        'isd document date',
        'isd invoice date',
    ],
    invoiceType: [
        'document type',
        'invoice type',
        'doctype',
        'note type',
        'supply type',
        'type of document',
    ],
    taxableValue: [
        'taxable value',
        'taxable amount',
        'txval',
        'assessable value',
        'taxable value rs',
    ],
    igst: [
        // Standard B2B / CDNR
        'integrated tax amount',
        'igst amount',
        'igst',
        'integrated tax',
        'igst paid',
        // IMPG — GST portal labels tax paid via ICEGATE
        'integrated tax paid through icegate',
        'integrated tax paid',
        'igst paid through icegate',
    ],
    cgst: [
        'central tax amount',
        'cgst amount',
        'cgst',
        'central tax',
        'cgst paid',
    ],
    sgst: [
        'state/ut tax amount',
        'sgst amount',
        'sgst',
        'state tax',
        'state/ut tax',
        'utgst amount',
        'sgst paid',
    ],
    cess: [
        'cess amount',
        'cess',
        'cess paid',
        'cess paid through icegate',
    ],
    totalTax: ['total tax', 'tax amount', 'gst amount', 'total gst'],
    invoiceValue: [
        'invoice value',
        'total value',
        'gross value',
        'note value',
        'document value',          // ECO sheet uses "Document value(₹)"
        'bill of entry value',
        'boe value',
        'total invoice value',
        'b/e value',
        'be value',
    ],
    itcAvailable: [
        'itc availability',
        'itc available',
        'eligibility for itc',
        'eligibility of itc',      // ISD sheet uses this exact phrasing
        'itc eligibility',
        'whether eligible for itc',
        'availability of itc',
    ],
    reverseCharge: [
        'reverse charge',
        'rcm',
        'rev charge',
        'reverse charge applicable',
        'whether supply attracts reverse charge',
    ],
    pos: [
        'place of supply',
        'place of supply(name of state/ut)',
        'place of supply (state)',
        'place of supply(state/ut)',
        'port code',          // IMPG uses port code as location identifier
        'pos',
    ],
    filingPeriod: [
        'gstr-1/iff/gstr-5 period',
        'gstr-1/1a/iff period',    // ECO sheet uses this variant
        'gstr-1 period',
        'isd gstr-6 period',       // ISD sheet
        'gstr-2b filing period',
        'filing period',
        'return period',
        'tax period',
    ],
    taxRate: [
        'applicable % of tax rate',
        'tax rate',
        'rate of tax',
        'applicable tax rate',
        'rate (%)',
        'tax rate (%)',
    ],
};

// Sheet names to attempt parsing (lower-cased, whitespace-stripped)
const SUPPORTED_SHEET_KEYS = ['b2b', 'b2ba', 'cdnr', 'cdnra', 'isd', 'isda', 'impg', 'impgsez', 'eco'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalise a column header: lower-case, trim, collapse spaces,
 * strip ₹ / () / Rs. so "Integrated Tax Amount(₹)" becomes
 * "integrated tax amount" for alias matching.
 */
function normHeader(h) {
    if (h == null) return '';
    try {
        return String(h)
            .toLowerCase()
            .replace(/[₹()*]/g, '')       // strip currency/bracket chars
            .replace(/\brs\.?\b/g, '')    // strip "rs" / "rs."
            .replace(/\./g, '')           // strip periods (e.g. "B/E No." → "b/e no")
            .replace(/\s+/g, ' ')
            .trim();
    } catch (_) {
        return '';
    }
}

/**
 * Build a field→columnIndex map from a raw row (array of cell values).
 */
function mapHeaders(row) {
    const map = {};
    row.forEach((cell, idx) => {
        const key = normHeader(cell);
        if (!key) return;
        for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
            if (map[field] != null) continue; // first match wins
            if (aliases.some((a) => {
                const na = normHeader(a);
                return key === na || key.includes(na);
            })) {
                map[field] = idx;
            }
        }
    });
    return map;
}

/**
 * A row qualifies as a data-column header when one of these is true:
 *
 * PRIMARY (B2B, CDNR, ECO, ISD …): GSTIN + invoice/doc number both present.
 *   Reason: the actual portal Excel has TWO header rows per sheet —
 *     Row N   group labels : "GSTIN of supplier" | "Invoice Details" (merged) | …
 *     Row N+1 real columns : "GSTIN of supplier" | "Invoice number" | "Invoice Date" | …
 *   Row N passes the old single-field test but lacks an invoice-number column,
 *   causing all data rows to fail. Requiring BOTH forces selection of Row N+1.
 *
 * SECONDARY (IMPG/IMPGSEZ …): no GSTIN column at all, but has an entry/ref
 *   number and ≥ 3 other tax/amount fields.
 */
function isUsableHeaderMap(colMap) {
    const hasGstin     = colMap.supplierGstin != null;
    const hasInvoiceNo = colMap.invoiceNumber != null;
    const fieldCount   = Object.keys(colMap).length;

    if (hasGstin && hasInvoiceNo) return true;                    // B2B, CDNR, ECO, ISD
    if (!hasGstin && hasInvoiceNo && fieldCount >= 4) return true; // IMPG (no GSTIN column)
    return false;
}

function safeString(v) {
    if (v == null) return '';
    try { return String(v).trim(); } catch (_) { return ''; }
}

function isRowEffectivelyEmpty(row) {
    return row.every((v) => !safeString(v));
}

/**
 * Detect the best data-header row index within the first maxScan non-empty rows.
 *
 * Strategy: among all rows that pass isUsableHeaderMap, pick the one with the
 * MOST matched fields (highest score). This handles two-row GST portal headers:
 *   Row 5 (group labels): "GSTIN of supplier" | "Invoice Details" | "Tax Amount"  → fewer matches
 *   Row 6 (real columns): "GSTIN of supplier" | "Invoice number" | "Invoice Date" | "Integrated Tax(₹)" | … → more matches
 * Row 6 wins because it has more individually named columns.
 */
function detectHeaderRowIndex(rows, maxScan = 30) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < Math.min(maxScan, rows.length); i++) {
        if (isRowEffectivelyEmpty(rows[i])) continue;
        const map = mapHeaders(rows[i]);
        if (!isUsableHeaderMap(map)) continue;
        const score = Object.keys(map).length;
        if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
        }
    }
    return bestIdx;
}

// ─── Value parsers ─────────────────────────────────────────────────────────────

function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date && !Number.isNaN(val.getTime())) return val;
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d;
    // DD/MM/YYYY or DD-MM-YYYY
    const m = String(val).match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
    if (m) {
        let y = parseInt(m[3], 10);
        if (y < 100) y += 2000;
        return new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    }
    return null;
}

function parseNum(val) {
    if (val == null) return 0;
    // ExcelJS formula result object
    if (typeof val === 'object' && val.result != null) return parseNum(val.result);
    const n = parseFloat(
        safeString(val)
            .replace(/,/g, '')
            .replace(/₹/g, ''),
    );
    return Number.isFinite(n) ? n : 0;
}

// ─── Row → Record ──────────────────────────────────────────────────────────────

/**
 * Convert a raw data row + column map into a normalised record.
 * Returns { record, skipReason }.
 */
function rowToRecord(row, colMap, sheetName) {
    const get = (f) => {
        const i = colMap[f];
        return i != null ? row[i] : undefined;
    };
    const str = (f) => safeString(get(f));

    const invoiceNumber = str('invoiceNumber');
    const invoiceDate = parseDate(get('invoiceDate'));
    const supplierGstinRaw = str('supplierGstin').toUpperCase();

    if (!invoiceNumber) return { record: null, skipReason: 'Missing invoice number' };
    if (!invoiceDate) return { record: null, skipReason: 'Invalid or missing invoice date' };

    // IMPG (imports) may have no supplier GSTIN – use synthetic key
    const supplierGstin = supplierGstinRaw || `IMPG-${invoiceNumber}`;

    const igst = parseNum(get('igst'));
    const cgst = parseNum(get('cgst'));
    const sgst = parseNum(get('sgst'));
    const cess = parseNum(get('cess'));
    let totalTax = parseNum(get('totalTax'));
    if (!totalTax) totalTax = igst + cgst + sgst + cess;

    const rcRaw = str('reverseCharge').toLowerCase();
    const isReverseCharge =
        rcRaw === 'y' || rcRaw === 'yes' || rcRaw === 'true' || rcRaw === '1';

    const itcRaw = (str('itcAvailable') || 'yes').toLowerCase();
    const itcAvailable =
        itcRaw.startsWith('n') || itcRaw.includes('ineligible') ? 'No' : 'Yes';

    // Infer invoiceType from sheet name when column absent
    let invoiceType = str('invoiceType');
    if (!invoiceType) {
        const s = (sheetName ?? '').toLowerCase();
        if (s.includes('cdn')) invoiceType = 'CDNR';
        else if (s.includes('impg')) invoiceType = 'IMPG';
        else if (s.includes('isd')) invoiceType = 'ISD';
        else invoiceType = 'R';
    }

    return {
        record: {
            supplierGstin,
            supplierName: str('supplierName'),
            invoiceNumber,
            invoiceDate,
            invoiceType,
            taxableValue: parseNum(get('taxableValue')),
            igst,
            cgst,
            sgst,
            cess,
            totalTax,
            invoiceValue: parseNum(get('invoiceValue')),
            itcAvailable,
            isReverseCharge,
            placeOfSupply: str('pos'),
            filingPeriod: str('filingPeriod'),
            taxRate: parseNum(get('taxRate')),
            sheetName: sheetName || 'Unknown',
        },
        skipReason: null,
    };
}

// ─── Sheet parser ──────────────────────────────────────────────────────────────

/** Parse a 2-D array of cell values extracted from one worksheet. */
function parseSheetRows(rows, sheetName) {
    const headerIdx = detectHeaderRowIndex(rows);
    if (headerIdx === -1) {
        return {
            sheetName,
            headerDetected: false,
            reason: 'Header row not detected within first 30 rows — unsupported format or empty sheet',
            headerRow: null,
            parsed: 0,
            skipped: 0,
            invalidRows: [],
            records: [],
        };
    }

    const colMap = mapHeaders(rows[headerIdx]);
    const records = [];
    const invalidRows = [];
    let skipped = 0;

    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (isRowEffectivelyEmpty(row)) {
            skipped++;
            continue;
        }
        const { record, skipReason } = rowToRecord(row, colMap, sheetName);
        if (record) {
            records.push(record);
        } else {
            skipped++;
            invalidRows.push({ rowIndex: i + 1, reason: skipReason });
        }
    }

    return {
        sheetName,
        headerDetected: true,
        headerRow: headerIdx + 1,
        parsed: records.length,
        skipped,
        invalidRows,
        records,
    };
}

// ─── ExcelJS cell extraction ───────────────────────────────────────────────────

/** Convert an ExcelJS cell value to a plain JS value. */
function cellValue(cell) {
    const v = cell.value;
    // Null / undefined — covers merged-cell slaves whose value is null
    if (v == null) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'object') {
        // Rich-text
        if (Array.isArray(v.richText)) return v.richText.map((r) => r.text ?? '').join('');
        // Formula result
        if (v.result != null) return v.result;
        // Hyperlink — has a .text property
        if (v.text != null) return v.text;
        // Fallback: try plain toString but guard against null prototype quirks
        try { return String(v); } catch (_) { return null; }
    }
    // Primitive — access cell.text safely (ExcelJS getter can throw on bad
    // cell types when the underlying value is null in a merged region)
    try {
        const t = cell.text;
        return (t != null && t !== '') ? t : v;
    } catch (_) {
        return v;
    }
}

/** Extract a 2-D array from an ExcelJS worksheet (skips fully empty rows). */
function extractSheetRows(sheet) {
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
        const cells = [];
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
            cells[colNum - 1] = cellValue(cell);
        });
        rows.push(cells);
    });
    return rows;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Parse a CSV/TXT buffer. Returns the standard result shape. */
export function parseGstrCsvBuffer(buffer) {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());

    if (lines.length < 2) {
        return {
            records: [],
            sheetSummary: [{ sheetName: 'CSV', headerDetected: false, reason: 'File is empty', parsed: 0, skipped: 0, invalidRows: [] }],
            totalSkipped: 0,
            errors: [],
        };
    }

    const delim =
        (lines[0].match(/;/g) ?? []).length > (lines[0].match(/,/g) ?? []).length
            ? ';'
            : ',';
    const rows = lines.map((line) =>
        line.split(delim).map((c) => c.replace(/^"|"$/g, '').trim()),
    );

    const result = parseSheetRows(rows, 'CSV');
    return {
        records: result.records,
        sheetSummary: [result],
        totalSkipped: result.skipped,
        errors: result.invalidRows.map((e) => ({ ...e, sheet: 'CSV' })),
    };
}

/**
 * Parse a GSTR-2B / GSTR-2A Excel buffer.
 * Processes all GST-portal sheets (B2B, B2BA, CDNR, CDNRA, ISD, IMPG, ECO, …).
 */
export async function parseGstrExcelBuffer(buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    if (!wb.worksheets.length) {
        return {
            records: [],
            sheetSummary: [],
            totalSkipped: 0,
            errors: [{ reason: 'No worksheets found in Excel file' }],
        };
    }

    // Separate known GST portal sheets from others
    const knownSheets = [];
    const otherSheets = [];
    for (const ws of wb.worksheets) {
        const key = (ws.name ?? '').toLowerCase().replace(/\s+/g, '');
        if (SUPPORTED_SHEET_KEYS.some((s) => key === s || key.startsWith(s))) {
            knownSheets.push(ws);
        } else {
            otherSheets.push(ws);
        }
    }

    // Use known portal sheets if found; fall back to all sheets
    const sheetsToProcess = knownSheets.length > 0 ? knownSheets : otherSheets;

    const allRecords = [];
    const sheetSummary = [];
    let totalSkipped = 0;
    const allErrors = [];

    for (const ws of sheetsToProcess) {
        const rows = extractSheetRows(ws);
        if (!rows.length) {
            sheetSummary.push({
                sheetName: ws.name,
                headerDetected: false,
                reason: 'Empty sheet',
                parsed: 0,
                skipped: 0,
                invalidRows: [],
            });
            continue;
        }

        const result = parseSheetRows(rows, ws.name);
        sheetSummary.push(result);
        allRecords.push(...result.records);
        totalSkipped += result.skipped;
        allErrors.push(
            ...result.invalidRows.map((e) => ({ ...e, sheet: ws.name })),
        );
    }

    return { records: allRecords, sheetSummary, totalSkipped, errors: allErrors };
}

/**
 * Entry point: detect file type, delegate to the right parser.
 * Returns { records, sheetSummary, totalSkipped, errors, fileType }.
 */
export async function parseGstrFile(buffer, fileName = '') {
    const lower = fileName.toLowerCase();

    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        const result = await parseGstrExcelBuffer(buffer);
        return { ...result, fileType: 'xlsx' };
    }
    if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
        const result = parseGstrCsvBuffer(buffer);
        return { ...result, fileType: 'csv' };
    }

    return {
        records: [],
        sheetSummary: [],
        totalSkipped: 0,
        errors: [{ reason: `Unsupported file format: ${fileName}` }],
        fileType: 'unknown',
    };
}
