/**
 * Excel-safe presentation helpers for XLSX export only.
 * Does not mutate database values.
 */
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

/** Soft cap below Excel's hard 32,767 cell limit (room for suffix). */
export const EXCEL_MAX_CELL_CHARS = 32000;
export const EXCEL_SHORTEN_SUFFIX = '[Text shortened for Excel export]';
export const EXCEL_MAX_HYPERLINK_URL = 2000;

/** XML 1.0 Char production exclusions (controls + non-chars). Tabs/LF/CR kept. */
const INVALID_XML_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

const SHEET_NAME_BAD_RE = /[\\/?*\[\]:]/g;
const USED_SHEET_NAMES = Symbol('usedSheetNames');

/**
 * Remove XML 1.0-illegal control / non-characters. Preserve tabs, LF, CR, Unicode.
 */
export function stripInvalidXmlChars(input) {
    return String(input ?? '').replace(INVALID_XML_CHAR_RE, '');
}

/**
 * Drop unpaired UTF-16 surrogates; keep valid surrogate pairs (emoji, etc.).
 */
export function normalizeMalformedSurrogates(input) {
    const s = String(input ?? '');
    let out = '';
    for (let i = 0; i < s.length; i += 1) {
        const c = s.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff) {
            const next = s.charCodeAt(i + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
                out += s[i] + s[i + 1];
                i += 1;
            }
            // else drop lone high surrogate
        } else if (c >= 0xdc00 && c <= 0xdfff) {
            // drop lone low surrogate
        } else {
            out += s[i];
        }
    }
    return out;
}

export function truncateForExcelCell(input) {
    const s = String(input ?? '');
    if (s.length <= EXCEL_MAX_CELL_CHARS) return s;
    const keep = Math.max(0, EXCEL_MAX_CELL_CHARS - EXCEL_SHORTEN_SUFFIX.length - 1);
    return `${s.slice(0, keep)} ${EXCEL_SHORTEN_SUFFIX}`;
}

/**
 * Prevent Excel formula injection for text cells.
 * Prefixes a single apostrophe when value starts with = + - @
 */
export function guardExcelFormulaInjection(input) {
    const s = String(input ?? '');
    if (!s) return s;
    if (/^[=+\-@]/.test(s)) return `'${s}`;
    return s;
}

function isObjectIdLike(value) {
    if (!value || typeof value !== 'object') return false;
    if (typeof value.toHexString === 'function' && value.id) return true;
    if (value._bsontype === 'ObjectId') return true;
    if (value.constructor?.name === 'ObjectId') return true;
    return false;
}

function summarizeObject(obj) {
    try {
        const keys = Object.keys(obj).slice(0, 12);
        if (!keys.length) return '';
        return keys
            .map((k) => {
                const v = obj[k];
                if (v == null) return `${k}=`;
                if (typeof v === 'object') return `${k}=[…]`;
                return `${k}=${String(v).slice(0, 80)}`;
            })
            .join('; ');
    } catch {
        return '';
    }
}

/**
 * Coerce any export value to a presentation-safe Excel cell value.
 * @param {*} value
 * @param {{ forceText?: boolean, blank?: string }} [opts]
 * @returns {string|number|Date|boolean}
 */
export function excelSafeCellValue(value, opts = {}) {
    const blank = opts.blank ?? '';
    if (value == null) return blank;

    if (opts.forceText) {
        return finalizeText(stringifyForExport(value), { forceText: true });
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? blank : value;
    }

    if (typeof value === 'boolean') {
        return value ? 'Yes' : 'No';
    }

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return blank;
        return value;
    }

    if (typeof value === 'bigint') {
        return finalizeText(String(value), { forceText: true });
    }

    if (isObjectIdLike(value)) {
        return finalizeText(String(value), { forceText: true });
    }

    if (Array.isArray(value)) {
        return finalizeText(
            value
                .map((v) => {
                    if (v == null) return '';
                    if (typeof v === 'object') return summarizeObject(v);
                    return String(v);
                })
                .filter(Boolean)
                .join('; '),
        );
    }

    if (typeof value === 'object') {
        return finalizeText(summarizeObject(value));
    }

    return finalizeText(String(value));
}

function stringifyForExport(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value);
    }
    if (isObjectIdLike(value)) return String(value);
    if (Array.isArray(value)) {
        return value
            .map((v) => (v == null ? '' : typeof v === 'object' ? summarizeObject(v) : String(v)))
            .filter(Boolean)
            .join('; ');
    }
    if (typeof value === 'object') return summarizeObject(value);
    return String(value);
}

function finalizeText(raw, { forceText = false } = {}) {
    let s = stripInvalidXmlChars(normalizeMalformedSurrogates(raw));
    s = truncateForExcelCell(s);
    if (!s) return s;
    if (forceText || /^[=+\-@]/.test(s)) {
        return guardExcelFormulaInjection(s);
    }
    return s;
}

/** Alias for presentation text cells. */
export function excelSafeText(value, opts = {}) {
    return excelSafeCellValue(value, opts);
}

/**
 * Safe unique worksheet name (max 31, no \ / ? * [ ] :).
 */
export function safeExcelSheetName(desired, usedNames = new Set()) {
    let base = stripInvalidXmlChars(String(desired ?? 'Sheet'))
        .replace(SHEET_NAME_BAD_RE, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 31);
    if (!base) base = 'Sheet';
    let name = base;
    let n = 2;
    while (usedNames.has(name.toLowerCase())) {
        const suffix = ` (${n})`;
        name = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
        n += 1;
        if (n > 99) {
            name = `Sheet ${usedNames.size + 1}`.slice(0, 31);
            break;
        }
    }
    usedNames.add(name.toLowerCase());
    return name;
}

export function clampExcelColumnWidth(width, fallback = 12) {
    const n = Number(width);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(255, Math.max(1, n));
}

/**
 * Return a hyperlink URL only for valid http(s) of safe length; otherwise null (plain text).
 */
export function excelSafeHyperlinkUrl(raw) {
    const s = stripInvalidXmlChars(normalizeMalformedSurrogates(String(raw ?? ''))).trim();
    if (!s) return null;
    if (s.length > EXCEL_MAX_HYPERLINK_URL) return null;
    let parsed;
    try {
        parsed = new URL(s);
    } catch {
        return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname) return null;
    return parsed.toString();
}

/**
 * Cell value for a URL column: hyperlink when safe, else plain sanitized text.
 */
export function excelSafeUrlCell(raw) {
    const text = excelSafeCellValue(raw, { forceText: true });
    if (!text || text === '—') return text || '';
    const display = text.startsWith("'") ? text.slice(1) : text;
    const href = excelSafeHyperlinkUrl(display);
    if (!href) return text;
    return { text, hyperlink: href };
}

/**
 * Validate generated XLSX buffer before download. Throws Error with owner-friendly message.
 */
export async function validateGeneratedXlsxBuffer(buffer, { expectedSheetCount } = {}) {
    if (!buffer || !Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
        throw new Error('Excel export failed validation: empty workbook buffer.');
    }
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    if (buf.length < 64 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
        throw new Error('Excel export failed validation: file is not a valid XLSX package.');
    }

    let zip;
    try {
        zip = await JSZip.loadAsync(buf);
    } catch {
        throw new Error('Excel export failed validation: workbook ZIP package could not be opened.');
    }

    const required = [
        '[Content_Types].xml',
        'xl/workbook.xml',
        'xl/_rels/workbook.xml.rels',
        'xl/styles.xml',
    ];
    for (const name of required) {
        if (!zip.file(name)) {
            throw new Error(`Excel export failed validation: missing package part ${name}.`);
        }
    }
    const sheetFiles = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n));
    if (!sheetFiles.length) {
        throw new Error('Excel export failed validation: no worksheets found.');
    }
    if (expectedSheetCount != null && sheetFiles.length !== expectedSheetCount) {
        throw new Error(
            `Excel export failed validation: expected ${expectedSheetCount} sheets, found ${sheetFiles.length}.`,
        );
    }

    for (const name of Object.keys(zip.files)) {
        if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue;
        const text = await zip.file(name).async('string');
        if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(text)) {
            throw new Error(
                `Excel export failed validation: invalid XML characters in ${name}. Please retry export.`,
            );
        }
    }

    try {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        if (!wb.worksheets.length) {
            throw new Error('Excel export failed validation: workbook has no sheets.');
        }
    } catch (err) {
        const msg = String(err?.message || err);
        if (/failed validation/i.test(msg)) throw err;
        throw new Error(
            `Excel export failed validation: workbook could not be opened (${msg}). Please retry export.`,
        );
    }

    return true;
}

/** Track sheet names on a workbook via a private set. */
export function addSafeWorksheet(workbook, desiredName) {
    if (!workbook[USED_SHEET_NAMES]) workbook[USED_SHEET_NAMES] = new Set();
    const name = safeExcelSheetName(desiredName, workbook[USED_SHEET_NAMES]);
    return workbook.addWorksheet(name);
}
