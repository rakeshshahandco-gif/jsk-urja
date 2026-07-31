/**
 * Field-level normalizers for Discovery (Phase 3).
 * Pure functions — no DB access.
 */

const LEGAL_SUFFIXES = /\b(pvt\.?\s*ltd\.?|private\s+limited|llp|l\.?l\.?c\.?|inc\.?|corp\.?|co\.?|ltd\.?|limited|gmbh|plc)\b/gi;
const GENERIC_EMAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'hotmail.com', 'outlook.com',
    'live.com', 'rediffmail.com', 'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
]);

export function normalizeCompanyName(raw) {
    let s = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!s) return { normalized: '', legalName: '', validationStatus: 'missing' };
    // Keep legal-ish name before stripping suffixes
    const legalName = s.slice(0, 200);
    s = s.replace(/\|.*$/, '').trim();
    const withoutSuffix = s.replace(LEGAL_SUFFIXES, '').replace(/\s+/g, ' ').trim() || s;
    return {
        normalized: withoutSuffix.slice(0, 120),
        legalName,
        validationStatus: withoutSuffix.length >= 2 ? 'valid' : 'invalid',
    };
}

export function normalizeWebsite(raw) {
    const input = String(raw || '').trim();
    if (!input) return { normalized: '', domain: '', validationStatus: 'missing' };
    try {
        const withProto = /^https?:\/\//i.test(input) ? input : ('https://' + input);
        const u = new URL(withProto);
        if (!['http:', 'https:'].includes(u.protocol)) {
            return { normalized: '', domain: '', validationStatus: 'invalid' };
        }
        const domain = u.hostname.replace(/^www\./i, '').toLowerCase();
        if (!domain || domain === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(domain)) {
            return { normalized: '', domain: '', validationStatus: 'invalid' };
        }
        u.hash = '';
        return { normalized: u.toString(), domain, validationStatus: 'valid' };
    } catch {
        return { normalized: '', domain: '', validationStatus: 'invalid' };
    }
}

export function normalizeDomainValue(raw) {
    const w = normalizeWebsite(raw);
    return { normalized: w.domain, validationStatus: w.domain ? 'valid' : (String(raw || '').trim() ? 'invalid' : 'missing') };
}

export function normalizeEmail(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return { normalized: '', validationStatus: 'missing', isGeneric: false };
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    if (!ok) return { normalized: s, validationStatus: 'invalid', isGeneric: false };
    const domain = s.split('@')[1] || '';
    return { normalized: s, validationStatus: 'valid', isGeneric: GENERIC_EMAIL_DOMAINS.has(domain) };
}

export function normalizePhone(raw) {
    const input = String(raw || '').trim();
    const digits = input.replace(/\D/g, '');
    if (!digits) return { normalized: '', digits: '', validationStatus: 'missing', e164Hint: '' };
    if (digits.length < 8) return { normalized: input, digits, validationStatus: 'invalid', e164Hint: '' };

    let national = digits;
    let e164Hint = '+' + digits;
    if (digits.length === 10) {
        national = digits;
        e164Hint = '+91' + digits;
        return {
            normalized: '+91 ' + digits.slice(0, 5) + ' ' + digits.slice(5),
            digits: national,
            validationStatus: 'valid',
            e164Hint,
        };
    }
    if (digits.length === 12 && digits.startsWith('91')) {
        national = digits.slice(2);
        e164Hint = '+' + digits;
        return {
            normalized: '+91 ' + national.slice(0, 5) + ' ' + national.slice(5),
            digits: national,
            validationStatus: 'valid',
            e164Hint,
        };
    }
    if (digits.length === 11 && digits.startsWith('0')) {
        national = digits.slice(1);
        e164Hint = '+91' + national;
        return {
            normalized: '+91 ' + national.slice(0, 5) + ' ' + national.slice(5),
            digits: national,
            validationStatus: national.length === 10 ? 'valid' : 'invalid',
            e164Hint,
        };
    }
    return { normalized: e164Hint, digits, validationStatus: 'valid', e164Hint };
}

/** Indian GSTIN format check (structure only — not live portal verify). */
export function normalizeGstin(raw) {
    const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!s) return { normalized: '', validationStatus: 'missing' };
    const ok = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s);
    return { normalized: s, validationStatus: ok ? 'valid' : 'invalid' };
}

export function normalizePostalCode(raw, country = 'India') {
    const s = String(raw || '').trim();
    if (!s) return { normalized: '', validationStatus: 'missing' };
    if (String(country || '').toLowerCase().includes('india')) {
        const digits = s.replace(/\D/g, '');
        if (/^[1-9][0-9]{5}$/.test(digits)) return { normalized: digits, validationStatus: 'valid' };
        return { normalized: s, validationStatus: 'invalid' };
    }
    return { normalized: s.slice(0, 20), validationStatus: 'valid' };
}

export function normalizeGeoText(raw) {
    const s = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!s) return { normalized: '', validationStatus: 'missing' };
    return { normalized: s.slice(0, 120), validationStatus: 'valid' };
}

export function normalizeEstablishedYear(raw) {
    if (raw == null || raw === '') return { normalized: null, validationStatus: 'missing' };
    const n = Number(String(raw).replace(/[^\d]/g, '').slice(0, 4));
    const year = Number.isFinite(n) ? n : null;
    const now = new Date().getFullYear();
    if (!year || year < 1800 || year > now + 1) {
        return { normalized: year, validationStatus: 'invalid' };
    }
    return { normalized: year, validationStatus: 'valid' };
}

export function normalizeUrlList(raw) {
    const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    const out = [];
    for (const item of list) {
        const w = normalizeWebsite(item);
        if (w.normalized) out.push(w.normalized);
    }
    return { normalized: [...new Set(out)], validationStatus: out.length ? 'valid' : 'missing' };
}

export function normalizeProductCategories(raw) {
    const list = Array.isArray(raw) ? raw : (raw ? String(raw).split(/[,|;]/) : []);
    const normalized = [...new Set(list.map((x) => String(x || '').trim()).filter(Boolean).map((x) => x.slice(0, 80)))].slice(0, 20);
    return { normalized, validationStatus: normalized.length ? 'valid' : 'missing' };
}

export function normalizeDescription(raw) {
    const s = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!s) return { normalized: '', validationStatus: 'missing' };
    return { normalized: s.slice(0, 4000), validationStatus: 'valid' };
}

export function provenanceEntry(raw, normalizedResult, source, extra = {}) {
    return {
        raw: raw == null ? '' : raw,
        normalized: normalizedResult.normalized,
        source: source || 'unknown',
        extractedAt: new Date().toISOString(),
        confidence: extra.confidence != null ? extra.confidence : (normalizedResult.validationStatus === 'valid' ? 80 : (normalizedResult.validationStatus === 'missing' ? 0 : 40)),
        validationStatus: normalizedResult.validationStatus,
        ...extra,
    };
}
