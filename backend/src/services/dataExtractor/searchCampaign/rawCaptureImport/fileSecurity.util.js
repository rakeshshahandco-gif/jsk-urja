/**
 * Checkpoint 4A — file signature / ZIP preflight (before ExcelJS).
 * ZIP inspection uses direct dependency adm-zip@0.5.17 (entry metadata only; no extract).
 */
import crypto from 'crypto';
import path from 'path';
import AdmZip from 'adm-zip';
import { ApiError } from '../../../../utils/ApiError.js';
import {
    IMPORT_CSV_MAX_BYTES,
    IMPORT_FILENAME_MAX,
    IMPORT_XLSX_MAX_BYTES,
    IMPORT_XLSX_MAX_COMPRESSION_RATIO,
    IMPORT_XLSX_MAX_ENTRIES,
    IMPORT_XLSX_MAX_ENTRY_NAME_LEN,
    IMPORT_XLSX_MAX_ENTRY_UNCOMPRESSED,
    IMPORT_XLSX_MAX_PATH_DEPTH,
    IMPORT_XLSX_MAX_UNCOMPRESSED,
} from './constants.js';

const XLSX_SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const EXEC_DOUBLE_EXT = /\.(exe|bat|cmd|ps1|js|mjs|cjs|vbs|wsf|scr|dll|com|jar|msi)\.[a-z0-9]+$/i;

/** Test hook: set true when ExcelJS load would be allowed after preflight. */
export const __xlsxPreflight = { lastPassed: false, lastRejected: null };

export function sha256Buffer(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

export function sanitizeDisplayFileName(raw) {
    let name = String(raw || 'upload').replace(/\0/g, '');
    name = name.replace(/[/\\]/g, '_');
    name = name.replace(/\.\.+/g, '.');
    name = name.replace(/[\u0000-\u001F\u007F]/g, '');
    name = name.trim() || 'upload';
    if (name.length > IMPORT_FILENAME_MAX) name = name.slice(0, IMPORT_FILENAME_MAX);
    if (EXEC_DOUBLE_EXT.test(name)) {
        throw new ApiError(400, 'Executable or misleading double extension is not allowed');
    }
    return name;
}

export function extensionOf(fileName) {
    const base = path.basename(String(fileName || ''));
    const m = /\.([a-z0-9]+)$/i.exec(base);
    return m ? m[1].toLowerCase() : '';
}

export function assertSafeCsvBuffer(buffer, { declaredMime = '', originalName = '' } = {}) {
    if (!Buffer.isBuffer(buffer)) throw new ApiError(400, 'CSV file is required');
    if (buffer.length === 0) throw new ApiError(400, 'CSV file is empty');
    if (buffer.length > IMPORT_CSV_MAX_BYTES) {
        throw new ApiError(400, `CSV file must be at most ${IMPORT_CSV_MAX_BYTES} bytes`);
    }
    const ext = extensionOf(originalName);
    if (ext && ext !== 'csv') throw new ApiError(400, 'CSV extension required');
    if (buffer.length >= 4 && buffer.subarray(0, 4).equals(XLSX_SIG)) {
        throw new ApiError(400, 'File signature does not match CSV');
    }
    const head = buffer.subarray(0, Math.min(buffer.length, 256)).toString('utf8').toLowerCase();
    if (/^\s*<(!doctype\s+html|html|script)/i.test(head)) {
        throw new ApiError(400, 'HTML content is not allowed as CSV');
    }
    if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
        throw new ApiError(400, 'Executable content is not allowed as CSV');
    }
    const mime = String(declaredMime || '').toLowerCase();
    if (mime && !['text/csv', 'application/csv', 'text/plain', 'application/octet-stream', ''].includes(mime)) {
        if (!mime.includes('csv') && mime !== 'application/vnd.ms-excel') {
            throw new ApiError(400, 'CSV MIME type mismatch');
        }
    }
    const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
    const nuls = sample.filter((b) => b === 0).length;
    if (nuls > 0) throw new ApiError(400, 'Null bytes are not allowed in CSV');
}

function rejectZip(msg) {
    __xlsxPreflight.lastPassed = false;
    __xlsxPreflight.lastRejected = msg;
    throw new ApiError(400, msg);
}

function assertSafeEntryName(name) {
    const n = String(name || '');
    if (!n) rejectZip('ZIP entry name is empty');
    if (n.length > IMPORT_XLSX_MAX_ENTRY_NAME_LEN) rejectZip('ZIP entry name is too long');
    if (n.includes('\0')) rejectZip('ZIP entry name contains null byte');
    if (/^[a-zA-Z]:[\\/]/.test(n) || n.startsWith('/') || n.startsWith('\\')) {
        rejectZip('ZIP absolute paths are not allowed');
    }
    const norm = n.replace(/\\/g, '/');
    if (norm.split('/').includes('..') || norm.includes('../') || n.includes('..\\')) {
        rejectZip('ZIP path traversal is not allowed');
    }
    if (norm.split('/').filter(Boolean).length > IMPORT_XLSX_MAX_PATH_DEPTH) {
        rejectZip('ZIP entry path depth exceeds limit');
    }
}

const FORBIDDEN_ENTRY_RE = [
    /xl\/vbaproject\.bin/i,
    /xl\/activeX/i,
    /xl\/embeddings\//i,
    /xl\/macrosheets\//i,
    /encryptedpackage/i,
    /encryptioninfo/i,
    /xl\/externalLinks\//i,
    /\.exe$/i,
    /\.dll$/i,
    /\.bat$/i,
    /\.cmd$/i,
    /\.js$/i,
    /\.vbs$/i,
];

/**
 * Inspect ZIP central-directory metadata via adm-zip without extracting entry payloads.
 */
export function inspectXlsxZip(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4 || !buffer.subarray(0, 4).equals(XLSX_SIG)) {
        rejectZip('Invalid XLSX file signature');
    }
    let zip;
    try {
        zip = new AdmZip(buffer);
    } catch {
        rejectZip('Truncated or malformed ZIP package');
    }
    const entries = zip.getEntries() || [];
    if (entries.length > IMPORT_XLSX_MAX_ENTRIES) {
        rejectZip(`ZIP entry count exceeds ${IMPORT_XLSX_MAX_ENTRIES}`);
    }
    let uncompressed = 0;
    const names = [];
    for (const entry of entries) {
        const name = entry.entryName || '';
        assertSafeEntryName(name);
        names.push(name);
        const uncomp = Number(entry.header?.size ?? 0);
        const comp = Number(entry.header?.compressedSize ?? 0);
        if (uncomp > IMPORT_XLSX_MAX_ENTRY_UNCOMPRESSED) {
            rejectZip('ZIP entry uncompressed size exceeds limit');
        }
        uncompressed += uncomp;
        if (uncompressed > IMPORT_XLSX_MAX_UNCOMPRESSED) {
            rejectZip('Excel uncompressed content exceeds safe limit');
        }
        // Never call entry.getData() here
        for (const re of FORBIDDEN_ENTRY_RE) {
            if (re.test(name)) rejectZip(`Forbidden workbook entry: ${name.slice(0, 120)}`);
        }
        const method = entry.header?.method;
        if (method === 99) rejectZip('Encrypted Excel entries are not allowed');
        if (comp > 0 && uncomp / comp > IMPORT_XLSX_MAX_COMPRESSION_RATIO && uncomp > 1024 * 1024) {
            rejectZip('ZIP compression ratio exceeds safe limit');
        }
    }
    const lower = names.map((n) => n.toLowerCase());
    if (!lower.includes('[content_types].xml')) {
        rejectZip('Workbook missing [Content_Types].xml');
    }
    if (!lower.some((n) => n === 'xl/workbook.xml' || n.endsWith('/workbook.xml'))) {
        rejectZip('Workbook missing xl/workbook.xml');
    }
    // Overall ratio vs uploaded buffer
    if (buffer.length > 0 && uncompressed / buffer.length > IMPORT_XLSX_MAX_COMPRESSION_RATIO
        && uncompressed > 5 * 1024 * 1024) {
        rejectZip('ZIP package compression ratio exceeds safe limit');
    }
    return { uncompressed, names, entries: entries.length };
}

export function assertSafeXlsxBuffer(buffer, { declaredMime = '', originalName = '' } = {}) {
    __xlsxPreflight.lastPassed = false;
    __xlsxPreflight.lastRejected = null;
    if (!Buffer.isBuffer(buffer)) rejectZip('Excel file is required');
    if (buffer.length === 0) rejectZip('Excel file is empty');
    if (buffer.length > IMPORT_XLSX_MAX_BYTES) {
        rejectZip(`Excel file must be at most ${IMPORT_XLSX_MAX_BYTES} bytes`);
    }
    const ext = extensionOf(originalName);
    if (ext === 'xls' || ext === 'xlsm' || ext === 'xlsb') {
        rejectZip(`Unsupported Excel format: .${ext}`);
    }
    if (ext && ext !== 'xlsx') rejectZip('Only .xlsx is supported');
    const mime = String(declaredMime || '').toLowerCase();
    if (
        mime
        && mime !== 'application/octet-stream'
        && !mime.includes('spreadsheetml')
        && mime !== 'application/zip'
        && mime !== 'application/vnd.ms-excel'
    ) {
        rejectZip('Excel MIME type mismatch');
    }
    const meta = inspectXlsxZip(buffer);
    __xlsxPreflight.lastPassed = true;
    return meta;
}

/** Checkpoint 4A: imports use in-memory ExcelJS.load - no temp files. */
export function createImportTempDir() {
    throw new ApiError(500, 'Temporary files are not used for RawCapture imports');
}
export function writeTempFile() {
    throw new ApiError(500, 'Temporary files are not used for RawCapture imports');
}
export function cleanupPath() {
    // no-op retained for API compatibility with Checkpoint 4
}

export const estimateZipMeta = inspectXlsxZip;
