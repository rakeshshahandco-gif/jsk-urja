import { ApiError } from '../../../../utils/ApiError.js';
import {
    SEARCH_QUERY_FORBIDDEN_BODY,
    SEARCH_QUERY_NOTES_MAX,
    SEARCH_QUERY_REJECTION_MAX,
    SEARCH_QUERY_SOURCE_HINTS,
    SEARCH_QUERY_STATUSES,
    SEARCH_QUERY_TEXT_MAX,
    SEARCH_QUERY_TEXT_MIN,
    SEARCH_QUERY_TYPES,
} from './constants.js';

export function collapseWhitespace(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeQueryText(raw, { field = 'queryText' } = {}) {
    const s = collapseWhitespace(raw);
    if (!s || s.length < SEARCH_QUERY_TEXT_MIN) {
        throw new ApiError(400, `${field} must be at least ${SEARCH_QUERY_TEXT_MIN} characters`);
    }
    if (s.length > SEARCH_QUERY_TEXT_MAX) {
        throw new ApiError(400, `${field} must be at most ${SEARCH_QUERY_TEXT_MAX} characters`);
    }
    return s;
}

/** Comparison key: lowercase, collapsed space; keep letters/digits from any script (CJK/Unicode). */
export function normalizeQueryKey(raw = '') {
    let s = collapseWhitespace(raw).toLowerCase();
    s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    s = s.replace(/\s*:\s*/g, ':');
    // Keep Unicode letters + numbers so Chinese product queries remain valid keys.
    // Latin stop-word / plural folding still applies to English tokens only.
    s = s.replace(/[^\p{L}\p{N}:\-\/"'\s]+/gu, ' ');
    s = s.replace(/\b(in|for|the|a|an|of|and|&)\b/g, ' ');
    s = s.replace(/\bcompanies\b/g, 'company');
    s = s.replace(/\bmanufacturers\b/g, 'manufacturer');
    s = s.replace(/\bintegrators\b/g, 'integrator');
    s = s.replace(/\bdistributors\b/g, 'distributor');
    s = s.replace(/\bdealers\b/g, 'dealer');
    s = s.replace(/\bsuppliers\b/g, 'supplier');
    s = s.replace(/\bconsultants\b/g, 'consultant');
    s = collapseWhitespace(s);
    return s;
}

/** Token signature for near-duplicate checks (order-insensitive). */
export function queryTokenSignature(raw = '') {
    const key = normalizeQueryKey(raw);
    const tokens = key.split(/\s+/).filter(Boolean).sort();
    return tokens.join(' ');
}

export function assertSourceHint(value) {
    const v = collapseWhitespace(value).toLowerCase();
    if (!SEARCH_QUERY_SOURCE_HINTS.includes(v)) {
        throw new ApiError(400, `Unsupported sourceHint value: ${value}`);
    }
    return v;
}

export function assertQueryType(value) {
    const v = collapseWhitespace(value).toLowerCase();
    if (!SEARCH_QUERY_TYPES.includes(v)) {
        throw new ApiError(400, `Unsupported queryType value: ${value}`);
    }
    return v;
}

export function assertQueryStatus(value) {
    const v = collapseWhitespace(value).toLowerCase();
    if (!SEARCH_QUERY_STATUSES.includes(v)) {
        throw new ApiError(400, `Unsupported status value: ${value}`);
    }
    return v;
}

export function rejectForbiddenQueryBody(body = {}) {
    const bad = Object.keys(body || {}).filter((k) => SEARCH_QUERY_FORBIDDEN_BODY.includes(k));
    if (bad.length) {
        throw new ApiError(400, `Do not send ${bad.join(', ')}; company scope and audit fields come from auth context`);
    }
}

export function buildGoogleSearchUrl(queryText) {
    const q = encodeURIComponent(String(queryText ?? ''));
    return `https://www.google.com/search?q=${q}`;
}

/**
 * Build approved search URL from sourceHint + queryText only.
 * Never accepts a client-supplied URL. Never stores cookies/tokens/session.
 * Facebook / IndiaMART remain blank until a stable public format is approved.
 */
export function buildSearchUrl(sourceHint, queryText) {
    const src = String(sourceHint || '').toLowerCase();
    const text = String(queryText ?? '');
    // Reject accidental scheme injection into query text used as URL body (defense in depth).
    if (/^(javascript|data|file|vbscript):/i.test(text.trim())) {
        throw new ApiError(400, 'queryText must not contain executable URL schemes');
    }
    if (src === 'google' || src === 'web' || src === 'official_website' || src === 'manual') {
        return buildGoogleSearchUrl(text);
    }
    // Facebook / IndiaMART: keep text only — no unstable public search URL invented here.
    return '';
}

/** Reject any client attempt to supply searchUrl (also listed in forbidden body). */
export function assertNoClientSearchUrl(body = {}) {
    if (Object.prototype.hasOwnProperty.call(body || {}, 'searchUrl')) {
        throw new ApiError(400, 'Do not send searchUrl; it is generated server-side');
    }
}

export function normalizeNotes(raw) {
    if (raw == null || raw === '') return '';
    const s = collapseWhitespace(String(raw));
    if (s.length > SEARCH_QUERY_NOTES_MAX) {
        throw new ApiError(400, `notes must be at most ${SEARCH_QUERY_NOTES_MAX} characters`);
    }
    return s;
}

export function normalizeRejectionReason(raw, { required = false } = {}) {
    const s = collapseWhitespace(String(raw || ''));
    if (required && !s) throw new ApiError(400, 'rejectionReason is required');
    if (s.length > SEARCH_QUERY_REJECTION_MAX) {
        throw new ApiError(400, `rejectionReason must be at most ${SEARCH_QUERY_REJECTION_MAX} characters`);
    }
    return s;
}

export function locationParts(campaign = {}) {
    return {
        city: collapseWhitespace(campaign.city || ''),
        state: collapseWhitespace(campaign.state || ''),
        country: collapseWhitespace(campaign.country || ''),
    };
}

export function joinLocation(parts = {}) {
    return [parts.city, parts.state, parts.country].filter(Boolean).join(' ');
}
