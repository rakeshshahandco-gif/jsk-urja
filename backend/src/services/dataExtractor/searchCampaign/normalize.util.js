import { ApiError } from '../../../utils/ApiError.js';
import {
    SEARCH_CAMPAIGN_ARRAY_MAX,
    SEARCH_CAMPAIGN_DESCRIPTION_MAX,
    SEARCH_CAMPAIGN_FORBIDDEN_BODY_FIELDS,
    SEARCH_CAMPAIGN_NAME_MAX,
    SEARCH_CAMPAIGN_REQUIRED_CONTACT_FIELDS,
    SEARCH_CAMPAIGN_SOURCES,
    SEARCH_CAMPAIGN_STATUSES,
    SEARCH_CAMPAIGN_STRING_MAX,
    SEARCH_CAMPAIGN_WRITABLE_FIELDS,
} from './constants.js';

export function collapseWhitespace(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeDisplayString(value, { max = SEARCH_CAMPAIGN_STRING_MAX, field = 'field' } = {}) {
    const s = collapseWhitespace(value);
    if (s.length > max) {
        throw new ApiError(400, `${field} must be at most ${max} characters`);
    }
    return s;
}

export function normalizeNameForIndex(name = '') {
    return collapseWhitespace(name).toLowerCase();
}

/**
 * Trim, drop blanks, case-insensitive dedupe while preserving first-seen display casing.
 */
export function normalizeStringArray(raw, { field = 'array', maxItems = SEARCH_CAMPAIGN_ARRAY_MAX, itemMax = SEARCH_CAMPAIGN_STRING_MAX } = {}) {
    if (raw == null) return [];
    if (!Array.isArray(raw)) {
        throw new ApiError(400, `${field} must be an array of strings`);
    }
    if (raw.length > maxItems * 2) {
        throw new ApiError(400, `${field} has too many entries`);
    }
    const out = [];
    const seen = new Set();
    for (const item of raw) {
        if (typeof item !== 'string' && typeof item !== 'number') {
            throw new ApiError(400, `${field} must contain strings only`);
        }
        const s = collapseWhitespace(String(item));
        if (!s) continue;
        if (s.length > itemMax) {
            throw new ApiError(400, `${field} entry exceeds ${itemMax} characters`);
        }
        const key = s.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
        if (out.length > maxItems) {
            throw new ApiError(400, `${field} may contain at most ${maxItems} values`);
        }
    }
    return out;
}

export function assertAllowedEnumArray(values, allowed, field) {
    const allow = new Set(allowed);
    for (const v of values) {
        if (!allow.has(v)) {
            throw new ApiError(400, `Unsupported ${field} value: ${v}`);
        }
    }
    return values;
}

export function rejectForbiddenBodyFields(body = {}) {
    const bad = [];
    for (const key of Object.keys(body || {})) {
        if (SEARCH_CAMPAIGN_FORBIDDEN_BODY_FIELDS.includes(key)) bad.push(key);
    }
    if (bad.length) {
        throw new ApiError(400, `Do not send ${bad.join(', ')}; company scope and audit fields come from auth context`);
    }
}

export function rejectUnknownWritableFields(body = {}) {
    const allowed = new Set(SEARCH_CAMPAIGN_WRITABLE_FIELDS);
    const unknown = Object.keys(body || {}).filter((k) => !allowed.has(k));
    if (unknown.length) {
        throw new ApiError(400, `Unknown fields: ${unknown.join(', ')}`);
    }
}

export function assertValidStatus(status) {
    if (!SEARCH_CAMPAIGN_STATUSES.includes(status)) {
        throw new ApiError(400, `Unsupported status value: ${status}`);
    }
    return status;
}

export function pickWritablePayload(body = {}) {
    rejectForbiddenBodyFields(body);
    rejectUnknownWritableFields(body);
    const payload = {};
    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
        const name = normalizeDisplayString(body.name, { max: SEARCH_CAMPAIGN_NAME_MAX, field: 'name' });
        if (!name) throw new ApiError(400, 'name is required');
        payload.name = name;
        payload.nameNormalized = normalizeNameForIndex(name);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'description')) {
        payload.description = normalizeDisplayString(body.description, {
            max: SEARCH_CAMPAIGN_DESCRIPTION_MAX,
            field: 'description',
        });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'targetIndustry')) {
        const targetIndustry = normalizeDisplayString(body.targetIndustry, { field: 'targetIndustry' });
        if (!targetIndustry) throw new ApiError(400, 'targetIndustry is required');
        payload.targetIndustry = targetIndustry;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'relatedIndustries')) {
        payload.relatedIndustries = normalizeStringArray(body.relatedIndustries, { field: 'relatedIndustries' });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'targetProducts')) {
        payload.targetProducts = normalizeStringArray(body.targetProducts, { field: 'targetProducts' });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'businessTypes')) {
        payload.businessTypes = normalizeStringArray(body.businessTypes, { field: 'businessTypes' });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'country')) {
        payload.country = normalizeDisplayString(body.country, { field: 'country' });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'state')) {
        payload.state = normalizeDisplayString(body.state, { field: 'state' });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'city')) {
        payload.city = normalizeDisplayString(body.city, { field: 'city' });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'locationScope')) {
        payload.locationScope = normalizeDisplayString(body.locationScope, { field: 'locationScope', max: 40 });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'relatedKeywords')) {
        payload.relatedKeywords = normalizeStringArray(body.relatedKeywords, { field: 'relatedKeywords' });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'searchMarket')) {
        payload.searchMarket = normalizeDisplayString(body.searchMarket, { field: 'searchMarket', max: 60 });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'selectedSources')) {
        payload.selectedSources = normalizeStringArray(body.selectedSources, { field: 'selectedSources' });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'worldwide')) {
        payload.worldwide = body.worldwide === true || body.worldwide === 'true' || body.worldwide === 1 || body.worldwide === '1';
    }
    if (Object.prototype.hasOwnProperty.call(body, 'expandCities')) {
        payload.expandCities = normalizeStringArray(body.expandCities, { field: 'expandCities' });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'expandStates')) {
        payload.expandStates = normalizeStringArray(body.expandStates, { field: 'expandStates' });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'includeKeywords')) {
        payload.includeKeywords = normalizeStringArray(body.includeKeywords, { field: 'includeKeywords' });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'excludeKeywords')) {
        payload.excludeKeywords = normalizeStringArray(body.excludeKeywords, { field: 'excludeKeywords' });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'sources')) {
        payload.sources = assertAllowedEnumArray(
            normalizeStringArray(body.sources, { field: 'sources' }),
            SEARCH_CAMPAIGN_SOURCES,
            'sources',
        );
    }
    if (Object.prototype.hasOwnProperty.call(body, 'requiredContactFields')) {
        payload.requiredContactFields = assertAllowedEnumArray(
            normalizeStringArray(body.requiredContactFields, { field: 'requiredContactFields' }),
            SEARCH_CAMPAIGN_REQUIRED_CONTACT_FIELDS,
            'requiredContactFields',
        );
    }
    if (Object.prototype.hasOwnProperty.call(body, 'minimumQualificationScore')) {
        const n = Number(body.minimumQualificationScore);
        if (!Number.isFinite(n) || Math.floor(n) !== n) {
            throw new ApiError(400, 'minimumQualificationScore must be an integer between 0 and 100');
        }
        if (n < 0 || n > 100) {
            throw new ApiError(400, 'minimumQualificationScore must be between 0 and 100');
        }
        payload.minimumQualificationScore = n;
    }
    return payload;
}

export function buildCreatePayload(body = {}) {
    const payload = pickWritablePayload(body || {});
    if (!payload.name) throw new ApiError(400, 'name is required');
    if (!payload.targetIndustry) throw new ApiError(400, 'targetIndustry is required');
    if (payload.minimumQualificationScore == null) payload.minimumQualificationScore = 60;
    if (payload.description == null) payload.description = '';
    if (payload.relatedIndustries == null) payload.relatedIndustries = [];
    if (payload.targetProducts == null) payload.targetProducts = [];
    if (payload.businessTypes == null) payload.businessTypes = [];
    if (payload.country == null) payload.country = '';
    if (payload.state == null) payload.state = '';
    if (payload.city == null) payload.city = '';
    if (payload.locationScope == null) payload.locationScope = '';
    if (payload.relatedKeywords == null) payload.relatedKeywords = [];
    if (payload.searchMarket == null) payload.searchMarket = 'india_global_web';
    if (payload.selectedSources == null) payload.selectedSources = [];
    if (payload.worldwide == null) payload.worldwide = false;
    if (payload.expandCities == null) payload.expandCities = [];
    if (payload.expandStates == null) payload.expandStates = [];
    if (payload.includeKeywords == null) payload.includeKeywords = [];
    if (payload.excludeKeywords == null) payload.excludeKeywords = [];
    if (payload.sources == null) payload.sources = [];
    if (payload.requiredContactFields == null) payload.requiredContactFields = [];
    return payload;
}