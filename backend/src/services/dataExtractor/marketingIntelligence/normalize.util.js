export function assertNoSecrets(obj) {
    const blob = JSON.stringify(obj || {});
    if (/\b(password|cookie|authorization|sessiontoken|openai_api_key)\b|bearer\s+[a-z0-9._-]+|sk-[a-z0-9]{16,}|data:image\/[a-z0-9+.-]+;base64,|\"[a-z0-9+\/]{80,}={0,2}\"/i.test(blob)) {
        const err = new Error('Refusing to store or return secret/session/media values');
        err.statusCode = 500;
        throw err;
    }
}

export function rejectTenantOverrides(payload = {}) {
    if (payload.companyId != null || payload.tenantId != null) {
        const err = new Error('companyId/tenantId overrides are rejected');
        err.statusCode = 400;
        throw err;
    }
}

export function normalizeEmail(raw) {
    return String(raw || '').trim().toLowerCase();
}

export function normalizePhone(raw, defaultCountryCode = '91') {
    let d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 10) d = `${defaultCountryCode}${d}`;
    if (d.startsWith('0') && d.length === 11) d = `${defaultCountryCode}${d.slice(1)}`;
    return d;
}

export function isValidEmail(email) {
    const e = normalizeEmail(email);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function isValidPhone(phone) {
    const p = normalizePhone(phone);
    return p.length >= 10 && p.length <= 15;
}

export function isGenericEmail(email) {
    const e = normalizeEmail(email);
    const local = e.split('@')[0] || '';
    return /^(info|sales|support|contact|admin|office|enquiry|inquiry|hello|mail)$/i.test(local);
}

export function fingerprint(parts = []) {
    return parts.map((p) => String(p ?? '').trim().toLowerCase()).filter(Boolean).join('|');
}

export function historyEntry(action, userId, previous, next, reason = '', extra = {}) {
    return {
        at: new Date(),
        action,
        userId: userId || null,
        previousStatus: previous?.status || '',
        resultingStatus: next?.status || '',
        reason: String(reason || '').slice(0, 500),
        ...extra,
        sourceType: 'system',
    };
}
