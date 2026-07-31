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

export function stripInjected(text) {
    return String(text || '')
        .replace(/ignore\s+(all\s+)?(previous|prior)\s+instructions?/gi, '[untrusted-instruction-removed]')
        .replace(/reveal\s+(api|secret|password|key)/gi, '[untrusted-instruction-removed]')
        .replace(/executeMongo|runQuery|callEndpoint/gi, '[untrusted-tool-removed]');
}

export function normalizeDomain(raw) {
    let s = String(raw || '').trim().toLowerCase();
    if (!s) return '';
    s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0];
    return s;
}

export function normalizePhone(raw) {
    const d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 10) return `91${d}`;
    return d;
}

export function normalizeEmail(raw) {
    return String(raw || '').trim().toLowerCase();
}

export function emailDomain(email) {
    const e = normalizeEmail(email);
    const i = e.indexOf('@');
    return i > 0 ? e.slice(i + 1) : '';
}

export function fingerprint(parts = []) {
    return parts.map((p) => String(p ?? '').trim().toLowerCase()).filter(Boolean).join('|');
}

export function clampLimit(n, def, max) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return def;
    return Math.min(Math.floor(v), max);
}
