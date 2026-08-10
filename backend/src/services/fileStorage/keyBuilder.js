import path from 'path';
import { randomUUID } from 'crypto';

const UNSAFE_CHARS = /[^\w.\-()+@ ]+/g;

/**
 * Sanitize a user-facing file name for object keys (no paths, no traversal).
 */
export function sanitizeFileName(originalFileName = '') {
    const base = path.basename(String(originalFileName || 'file')).normalize('NFKC');
    let cleaned = base.replace(/\\/g, '/').split('/').pop() || 'file';
    cleaned = cleaned.replace(/\0/g, '');
    cleaned = cleaned.replace(UNSAFE_CHARS, '_');
    cleaned = cleaned.replace(/\.+/g, '.');
    cleaned = cleaned.replace(/^[.\s]+|[.\s]+$/g, '');
    if (!cleaned || cleaned === '.' || cleaned === '..') cleaned = 'file';
    if (cleaned.length > 180) {
        const ext = path.extname(cleaned).slice(0, 20);
        const stem = path.basename(cleaned, path.extname(cleaned)).slice(0, 160);
        cleaned = `${stem || 'file'}${ext}`;
    }
    return cleaned;
}

function assertSafeSegment(label, value) {
    const s = String(value ?? '').trim();
    if (!s) throw new Error(`${label} is required for storage key`);
    if (s.includes('..') || s.includes('/') || s.includes('\\') || s.includes('\0')) {
        throw new Error(`${label} contains invalid path characters`);
    }
    if (!/^[\w.\-:@]+$/i.test(s)) {
        throw new Error(`${label} contains invalid characters`);
    }
    return s;
}

function assertSafeModule(moduleName) {
    const s = String(moduleName ?? '').trim().toLowerCase();
    if (!s) throw new Error('module is required for storage key');
    if (s.includes('..') || s.includes('/') || s.includes('\\') || s.includes('\0')) {
        throw new Error('module contains invalid path characters');
    }
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(s)) {
        throw new Error('module must be a short slug (a-z, 0-9, _, -)');
    }
    return s;
}

/**
 * Build private object key:
 * company/{companyId}/financial-year/{financialYearId}/{module}/YYYY/MM/{uuid}-{safeFileName}
 *
 * financialYearId may be "none" when FY is not applicable for a module.
 */
export function buildObjectKey({
    companyId,
    financialYearId,
    module: moduleName,
    originalFileName,
    now = new Date(),
} = {}) {
    const company = assertSafeSegment('companyId', companyId);
    const fy = assertSafeSegment('financialYearId', financialYearId || 'none');
    const mod = assertSafeModule(moduleName);
    const safeName = sanitizeFileName(originalFileName);
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const id = randomUUID();

    return [
        'company',
        company,
        'financial-year',
        fy,
        mod,
        yyyy,
        mm,
        `${id}-${safeName}`,
    ].join('/');
}

/**
 * Reject unsafe object keys for delete/get operations.
 */
export function assertExactObjectKey(objectKey) {
    const key = String(objectKey || '').trim();
    if (!key) throw new Error('objectKey is required');
    if (key.includes('\\') || key.includes('\0')) throw new Error('objectKey is invalid');
    if (key.includes('..')) throw new Error('objectKey path traversal is not allowed');
    if (key.startsWith('/') || key.endsWith('/')) throw new Error('objectKey must not start/end with /');
    if (key.includes('*') || key.includes('?') || key.includes('[')) {
        throw new Error('wildcard object keys are not allowed');
    }
    if (key.length > 1024) throw new Error('objectKey is too long');
    return key;
}
