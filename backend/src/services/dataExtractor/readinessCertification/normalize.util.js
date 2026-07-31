import { createHash } from 'node:crypto';
import { UNSAFE_NOTE_PATTERNS, UNSAFE_PAYLOAD_PATTERNS, LOCAL_ALLOWLIST, FORBIDDEN_OUTCOMES } from './constants.js';

export function assertNoSecrets(obj) {
    const blob = JSON.stringify(obj || {});
    if (/\b(password|cookie|authorization|sessiontoken|openai_api_key|api[_-]?key|render[_-]?api|github[_-]?token|private[_-]?key)\b|bearer\s+[a-z0-9._-]{8,}|sk-[a-z0-9]{16,}|ghp_[a-zA-Z0-9]{20,}|rnd_[a-z0-9]{10,}|mongodb(\+srv)?:\/\/[^\s'"]+|data:image\/[a-z0-9+.-]+;base64,/i.test(blob)) {
        const err = new Error('Refusing to store or return secret/session/credential values');
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
        .replace(/sk-[a-z0-9]{16,}|ghp_[a-zA-Z0-9]{20,}|rnd_[a-z0-9]{10,}/gi, '[redacted-key]')
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

export function assertSafeText(text, label = 'text') {
    const s = String(text || '');
    for (const re of UNSAFE_NOTE_PATTERNS) {
        if (re.test(s)) {
            const err = new Error(`${label} contains disallowed instructional/deployment content`);
            err.statusCode = 400;
            throw err;
        }
    }
    for (const re of UNSAFE_PAYLOAD_PATTERNS) {
        if (re.test(s)) {
            const err = new Error(`${label} contains unsafe/secret content`);
            err.statusCode = 400;
            throw err;
        }
    }
    return s.slice(0, 10000);
}

export function assertPayloadSafe(payload) {
    assertNoSecrets(payload);
    rejectUnsafeFilters(payload);
    const blob = JSON.stringify(payload || {});
    for (const re of UNSAFE_PAYLOAD_PATTERNS) {
        if (re.test(blob)) {
            const err = new Error('Unsafe readiness payload rejected');
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

export function forceNonExecutable(doc) {
    return {
        ...doc,
        executable: false,
        deploymentAuthorized: false,
        productionApproved: false,
    };
}

export function assertLocalTarget(target) {
    const t = String(target || '').trim().toLowerCase();
    if (!t) return 'localhost';
    if (/production|prod\.|render\.com|atlas|mongodb\.net/i.test(t)) {
        const err = new Error('Production/external targets are rejected for Phase 24 local checks');
        err.statusCode = 400;
        throw err;
    }
    const host = t.replace(/^https?:\/\//, '').split(/[/:]/)[0];
    if (!LOCAL_ALLOWLIST.includes(host) && host !== 'crm_test') {
        const err = new Error(`Target host not in localhost allowlist: ${host}`);
        err.statusCode = 400;
        throw err;
    }
    return host;
}

export function assertSafeOutcome(outcome) {
    if (FORBIDDEN_OUTCOMES.includes(String(outcome || ''))) {
        const err = new Error('Forbidden production-approval outcome rejected');
        err.statusCode = 400;
        throw err;
    }
    return outcome;
}

export function maskSecret(value) {
    const s = String(value || '');
    if (s.length <= 8) return '****';
    return `${s.slice(0, 3)}…${s.slice(-2)}`;
}

export function sanitizeExportFormula(value) {
    const s = String(value ?? '');
    if (/^[=+\-@]/.test(s)) return `'${s}`;
    return s;
}

export function sanitizeFileName(name) {
    const raw = String(name || 'evidence');
    if (raw.includes('..') || raw.includes('/') || raw.includes("\\") || /[<>:"|?*\x00-\x1f]/.test(raw)) {
        const err = new Error('Unsafe file name rejected');
        err.statusCode = 400;
        throw err;
    }
    return raw.slice(0, 120);
}


export function sanitizeAbsolutePath(p) {
    return String(p || '').replace(/^[A-Za-z]:\\/, '[drive]/').replace(/\/home\/[^/]+/, '[home]');
}
