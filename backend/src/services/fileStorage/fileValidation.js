import path from 'path';
import {
    BLOCKED_EXTENSIONS,
    BLOCKED_MIME_TYPES,
    DEFAULT_ALLOWED_EXTENSIONS,
    DEFAULT_ALLOWED_MIME_TYPES,
    DEFAULT_MAX_FILE_BYTES,
} from './constants.js';

function normalizeExt(fileName = '') {
    const ext = path.extname(String(fileName || '')).toLowerCase();
    return ext;
}

/**
 * Validate upload input before any provider write.
 * @returns {{ ok: true } | never}
 */
export function validateUploadInput({
    originalFileName,
    mimeType,
    buffer,
    maxBytes = DEFAULT_MAX_FILE_BYTES,
    allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS,
    allowedMimeTypes = DEFAULT_ALLOWED_MIME_TYPES,
} = {}) {
    if (!originalFileName || !String(originalFileName).trim()) {
        throw new Error('originalFileName is required');
    }
    if (!Buffer.isBuffer(buffer)) {
        throw new Error('buffer is required and must be a Buffer');
    }
    if (buffer.length === 0) {
        throw new Error('empty file is not allowed');
    }
    if (buffer.length > maxBytes) {
        throw new Error(`file exceeds max size of ${maxBytes} bytes`);
    }

    const ext = normalizeExt(originalFileName);
    if (!ext) {
        throw new Error('file extension is required');
    }
    if (BLOCKED_EXTENSIONS.includes(ext)) {
        throw new Error(`file extension ${ext} is not allowed`);
    }

    const mime = String(mimeType || '').trim().toLowerCase();
    if (!mime) {
        throw new Error('mimeType is required');
    }
    if (BLOCKED_MIME_TYPES.includes(mime)) {
        throw new Error(`mime type ${mime} is not allowed`);
    }

    const allowedExt = allowedExtensions.map((e) => e.toLowerCase());
    if (!allowedExt.includes(ext)) {
        throw new Error(`file extension ${ext} is not in the allowed list`);
    }

    const allowedMime = allowedMimeTypes.map((m) => m.toLowerCase());
    if (!allowedMime.includes(mime)) {
        throw new Error(`mime type ${mime} is not in the allowed list`);
    }

    return { ok: true, extension: ext, mimeType: mime, size: buffer.length };
}
