import { createHash } from 'node:crypto';
import { UNSAFE_PATTERNS } from './constants.js';

export function assertNoSecrets(obj) {
    const blob = JSON.stringify(obj || {});
    if (/\b(password|cookie|authorization|sessiontoken|openai_api_key|api[_-]?key)\b|bearer\s+[a-z0-9._-]{8,}|sk-[a-z0-9]{16,}|data:image\/[a-z0-9+.-]+;base64,/i.test(blob)) {
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

export function assertConfigSafe(payload) {
    assertNoSecrets(payload);
    rejectUnsafeFilters(payload);
    const blob = JSON.stringify(payload || {});
    for (const re of UNSAFE_PATTERNS) {
        if (re.test(blob)) {
            const err = new Error('Unsafe configuration rejected for sandbox evaluation');
            err.statusCode = 400;
            throw err;
        }
    }
}

export function snapshotHash(parts = {}) {
    const stable = JSON.stringify(parts, Object.keys(parts || {}).sort());
    return createHash('sha256').update(stable).digest('hex').slice(0, 48);
}

export function notDeleted() {
    return { isDeleted: { $ne: true } };
}

export function stableStringify(v) {
    return JSON.stringify(v ?? null);
}
