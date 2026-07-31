import { createHash } from 'node:crypto';
import { UNSAFE_COMMENT_PATTERNS } from './constants.js';

export function assertNoSecrets(obj) {
    const blob = JSON.stringify(obj || {});
    if (/\b(password|cookie|authorization|sessiontoken|openai_api_key|api[_-]?key)\b|bearer\s+[a-z0-9._-]{8,}|sk-[a-z0-9]{16,}|data:image\/[a-z0-9+.-]+;base64,|\"[a-z0-9+\/]{80,}={0,2}\"/i.test(blob)) {
        const err = new Error('Refusing to store or return secret/session/media values');
        err.statusCode = 500;
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

export function sanitizeComment(raw, max = 1000) {
    const text = String(raw || '').replace(/\u0000/g, '').trim().slice(0, max);
    for (const re of UNSAFE_COMMENT_PATTERNS) {
        if (re.test(text)) {
            const err = new Error('Comment contains disallowed instructional/action content');
            err.statusCode = 400;
            throw err;
        }
    }
    return text;
}

export function rejectUnsafeFilters(obj, path = '') {
    if (obj == null || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith('$') || ['__proto__', 'constructor', 'prototype'].includes(k)) {
            const err = new Error(`Unsafe filter key rejected: ${k}`);
            err.statusCode = 400;
            throw err;
        }
        if (typeof v === 'object') rejectUnsafeFilters(v, `${path}.${k}`);
    }
}

export function snapshotHash(parts = {}) {
    const stable = JSON.stringify(parts, Object.keys(parts || {}).sort());
    return createHash('sha256').update(stable).digest('hex').slice(0, 40);
}

export function sampleLabel(n, settings) {
    const low = settings?.lowSampleThreshold ?? 5;
    const mod = settings?.moderateSampleThreshold ?? 20;
    if (n < low) return 'LOW_SAMPLE';
    if (n < mod) return 'MODERATE_SAMPLE';
    return 'RELIABLE_SAMPLE';
}

export function agreementLabel(acceptCount, rejectCount, settings) {
    const total = acceptCount + rejectCount;
    if (total < (settings?.lowSampleThreshold ?? 5)) return 'LOW_SAMPLE';
    const ratio = acceptCount / total;
    if (ratio >= 0.85 || ratio <= 0.15) return 'STRONG_AGREEMENT';
    if (ratio >= 0.65 || ratio <= 0.35) return 'MAJORITY_AGREEMENT';
    if (Math.abs(0.5 - ratio) <= (settings?.conflictThreshold ?? 0.4)) return 'CONFLICTED';
    return 'SPLIT_REVIEW';
}
