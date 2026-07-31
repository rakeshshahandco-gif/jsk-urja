import { createHash } from 'node:crypto';
import { MAX_PAYLOAD_BYTES, UNSAFE_PAYLOAD_PATTERNS } from './constants.js';

export function assertNoSecrets(obj) {
    const blob = JSON.stringify(obj || {});
    if (/\b(password|cookie|authorization|sessiontoken|openai_api_key|api[_-]?key)\b|bearer\s+[a-z0-9._-]{8,}|sk-[a-z0-9]{16,}|data:image\/[a-z0-9+.-]+;base64,|\"[a-z0-9+\/]{80,}={0,2}\"/i.test(blob)) {
        const err = new Error('Refusing to store or return secret/session/media values');
        err.statusCode = 400;
        throw err;
    }
}

export function rejectTenantOverrides(payload = {}) {
    if (payload?.companyId != null || payload?.tenantId != null) {
        const err = new Error('companyId/tenantId overrides are rejected');
        err.statusCode = 400;
        throw err;
    }
}

export function sanitizeError(err) {
    return String(err?.message || err || 'Unexpected error')
        .replace(/mongodb(\+srv)?:\/\/[^\s'"]+/gi, '[redacted-uri]')
        .replace(/sk-[a-z0-9]{16,}/gi, '[redacted-key]')
        .slice(0, 400);
}

export function rejectUnsafeFilters(obj) {
    if (obj == null || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith('$') || ['__proto__', 'constructor', 'prototype'].includes(k)) {
            const err = new Error(`Unsafe filter key rejected: ${k}`);
            err.statusCode = 400;
            throw err;
        }
        if (typeof v === 'object') rejectUnsafeFilters(v);
    }
}

export function payloadChecksum(payload) {
    const stable = JSON.stringify(payload ?? {}, Object.keys(payload || {}).sort());
    return createHash('sha256').update(stable).digest('hex').slice(0, 48);
}

export function assertPayloadSafe(payload) {
    assertNoSecrets(payload);
    rejectUnsafeFilters(payload);
    const blob = JSON.stringify(payload || {});
    if (Buffer.byteLength(blob, 'utf8') > MAX_PAYLOAD_BYTES) {
        const err = new Error(`Configuration payload exceeds size limit (${MAX_PAYLOAD_BYTES} bytes)`);
        err.statusCode = 400;
        throw err;
    }
    for (const re of UNSAFE_PAYLOAD_PATTERNS) {
        if (re.test(blob)) {
            const err = new Error('Unsafe configuration content rejected');
            err.statusCode = 400;
            throw err;
        }
    }
    return true;
}

export function notDeleted() {
    return { isDeleted: { $ne: true } };
}

export function deepDiff(a, b, path = '') {
    const added = [];
    const removed = [];
    const changed = [];
    const left = a && typeof a === 'object' ? a : {};
    const right = b && typeof b === 'object' ? b : {};
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
        const p = path ? `${path}.${key}` : key;
        const lv = left[key];
        const rv = right[key];
        if (!(key in left)) added.push({ path: p, value: rv });
        else if (!(key in right)) removed.push({ path: p, value: lv });
        else if (typeof lv === 'object' && lv && typeof rv === 'object' && rv && !Array.isArray(lv) && !Array.isArray(rv)) {
            const nested = deepDiff(lv, rv, p);
            added.push(...nested.added);
            removed.push(...nested.removed);
            changed.push(...nested.changed);
        } else if (JSON.stringify(lv) !== JSON.stringify(rv)) {
            changed.push({ path: p, from: lv, to: rv });
        }
    }
    return { added, removed, changed };
}
