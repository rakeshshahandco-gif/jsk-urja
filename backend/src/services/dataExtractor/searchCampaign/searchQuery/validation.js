/**
 * SearchQuery validation entrypoints (Checkpoint 2).
 */
import { ApiError } from '../../../../utils/ApiError.js';
import {
    SEARCH_QUERY_BULK_MAX,
    SEARCH_QUERY_FORBIDDEN_BODY,
    SEARCH_QUERY_GEN_DEFAULT_LIMIT,
    SEARCH_QUERY_GEN_MAX_LIMIT,
    SEARCH_QUERY_GEN_MIN_LIMIT,
    SEARCH_QUERY_LIST_DEFAULT_LIMIT,
    SEARCH_QUERY_LIST_MAX_LIMIT,
    SEARCH_QUERY_SORT_FIELDS,
    SEARCH_QUERY_SOURCE_HINTS,
    SEARCH_QUERY_TYPES,
} from './constants.js';
import {
    assertQueryType,
    assertSourceHint,
    assertQueryStatus,
    normalizeNotes,
    normalizeQueryText,
    assertNoClientSearchUrl,
    normalizeRejectionReason,
    rejectForbiddenQueryBody,
} from './normalize.util.js';

const LIST_ALLOWED = new Set([
    'status', 'sourceHint', 'queryType', 'generationMethod', 'generationGroupId',
    'q', 'search', 'createdFrom', 'createdTo', 'updatedFrom', 'updatedTo',
    'includeArchived', 'page', 'limit', 'sort', 'sortDir', 'approvedOnly',
]);

const GEN_ALLOWED = new Set([
    'requestedLimit', 'selectedSources', 'selectedQueryTypes',
    'includeTechnicalQueries', 'includeSiteOperators', 'includeNegativeKeywords',
    'explicitGenerateWhilePaused',
]);

const MANUAL_ALLOWED = new Set(['queryText', 'sourceHint', 'notes', 'queryType']);
const UPDATE_ALLOWED = new Set(['queryText', 'sourceHint', 'notes', 'queryType']);
const REJECT_ALLOWED = new Set(['rejectionReason']);
const REGEN_ALLOWED = new Set([
    ...GEN_ALLOWED,
    'regenerationReason', 'parentQueryId', 'parentGenerationGroupId',
]);
const BULK_ALLOWED = new Set(['queryIds', 'rejectionReason']);

function rejectUnsafeKeys(obj = {}) {
    for (const key of Object.keys(obj || {})) {
        if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor') {
            throw new ApiError(400, `Unsafe key rejected: ${key}`);
        }
    }
}

function assertOnlyKeys(body, allowed, label) {
    rejectUnsafeKeys(body);
    const forbiddenHit = Object.keys(body || {}).filter(
        (k) => SEARCH_QUERY_FORBIDDEN_BODY.includes(k) && !allowed.has(k),
    );
    if (forbiddenHit.length) {
        throw new ApiError(400, `Do not send ${forbiddenHit.join(', ')}; company scope and audit fields come from auth context`);
    }
    const unknown = Object.keys(body || {}).filter((k) => !allowed.has(k));
    if (unknown.length) {
        throw new ApiError(400, `Unknown ${label} fields: ${unknown.join(', ')}`);
    }
}

function parseBool(raw, field = 'boolean') {
    if (raw === true || raw === 'true' || raw === '1') return true;
    if (raw === false || raw === 'false' || raw === '0' || raw == null || raw === '') return false;
    throw new ApiError(400, `${field} must be a boolean`);
}

function parseDate(raw, field) {
    if (raw == null || raw === '') return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) throw new ApiError(400, `Invalid ${field}`);
    return d;
}

function parseLimit(raw, { defaultLimit, min, max, field = 'requestedLimit' }) {
    const n = raw == null || raw === '' ? defaultLimit : Number(raw);
    if (!Number.isFinite(n) || Math.floor(n) !== n) {
        throw new ApiError(400, `${field} must be an integer`);
    }
    if (n < min) throw new ApiError(400, `${field} must be at least ${min}`);
    if (n > max) throw new ApiError(400, `${field} may not exceed ${max}`);
    return n;
}

function parseStringArray(raw, field, allowed = null) {
    if (raw == null || raw === '') return [];
    if (!Array.isArray(raw)) throw new ApiError(400, `${field} must be an array`);
    const out = [];
    for (const item of raw) {
        const s = String(item || '').trim().toLowerCase();
        if (!s) continue;
        if (allowed && !allowed.includes(s)) {
            throw new ApiError(400, `Unsupported ${field} value: ${item}`);
        }
        if (!out.includes(s)) out.push(s);
    }
    return out;
}

export function validateManualCreateBody(body = {}) {
    assertNoClientSearchUrl(body);
    assertOnlyKeys(body, MANUAL_ALLOWED, 'create');
    const queryText = normalizeQueryText(body.queryText);
    const sourceHint = assertSourceHint(body.sourceHint);
    const notes = normalizeNotes(body.notes);
    let queryType = 'manual';
    if (body.queryType != null && String(body.queryType).trim() !== '') {
        queryType = assertQueryType(body.queryType);
    }
    return { queryText, sourceHint, notes, queryType };
}

export function validateUpdateBody(body = {}) {
    assertNoClientSearchUrl(body);
    assertOnlyKeys(body, UPDATE_ALLOWED, 'update');
    const payload = {};
    if (Object.prototype.hasOwnProperty.call(body, 'queryText')) {
        payload.queryText = normalizeQueryText(body.queryText);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'sourceHint')) {
        payload.sourceHint = assertSourceHint(body.sourceHint);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
        payload.notes = normalizeNotes(body.notes);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'queryType')) {
        payload.queryType = assertQueryType(body.queryType);
    }
    if (!Object.keys(payload).length) {
        throw new ApiError(400, 'No updatable fields provided');
    }
    return payload;
}

export function validateRejectBody(body = {}) {
    assertOnlyKeys(body || {}, REJECT_ALLOWED, 'reject');
    return {
        rejectionReason: normalizeRejectionReason(body?.rejectionReason, { required: false }),
    };
}

export function validateGenerationOptions(body = {}, { allowRegenExtras = false } = {}) {
    const allowed = allowRegenExtras ? REGEN_ALLOWED : GEN_ALLOWED;
    assertOnlyKeys(body || {}, allowed, 'generation');

    const requestedLimit = parseLimit(body.requestedLimit, {
        defaultLimit: SEARCH_QUERY_GEN_DEFAULT_LIMIT,
        min: SEARCH_QUERY_GEN_MIN_LIMIT,
        max: SEARCH_QUERY_GEN_MAX_LIMIT,
    });

    const selectedSources = parseStringArray(body.selectedSources, 'selectedSources', [...SEARCH_QUERY_SOURCE_HINTS]);
    const selectedQueryTypes = parseStringArray(body.selectedQueryTypes, 'selectedQueryTypes', [...SEARCH_QUERY_TYPES]);

    const options = {
        requestedLimit,
        selectedSources,
        selectedQueryTypes,
        includeTechnicalQueries: parseBool(body.includeTechnicalQueries ?? true, 'includeTechnicalQueries'),
        includeSiteOperators: parseBool(body.includeSiteOperators ?? true, 'includeSiteOperators'),
        includeNegativeKeywords: parseBool(body.includeNegativeKeywords ?? true, 'includeNegativeKeywords'),
        explicitGenerateWhilePaused: parseBool(body.explicitGenerateWhilePaused ?? false, 'explicitGenerateWhilePaused'),
    };

    if (allowRegenExtras) {
        options.regenerationReason = normalizeNotes(body.regenerationReason || '').slice(0, 500);
        options.parentQueryId = body.parentQueryId ? String(body.parentQueryId).trim() : null;
        options.parentGenerationGroupId = body.parentGenerationGroupId
            ? String(body.parentGenerationGroupId).trim().slice(0, 80)
            : '';
    }

    return options;
}

export function validateBulkBody(body = {}, { requireReason = false } = {}) {
    assertOnlyKeys(body || {}, BULK_ALLOWED, 'bulk');
    if (!Array.isArray(body.queryIds) || !body.queryIds.length) {
        throw new ApiError(400, 'queryIds must be a non-empty array');
    }
    if (body.queryIds.length > SEARCH_QUERY_BULK_MAX) {
        throw new ApiError(400, `queryIds may not exceed ${SEARCH_QUERY_BULK_MAX}`);
    }
    const queryIds = [...new Set(body.queryIds.map((id) => String(id || '').trim()).filter(Boolean))];
    if (!queryIds.length) throw new ApiError(400, 'queryIds must be a non-empty array');
    const out = { queryIds };
    if (requireReason || body.rejectionReason != null) {
        out.rejectionReason = normalizeRejectionReason(body.rejectionReason, { required: requireReason });
    }
    return out;
}

export function validateListQuery(query = {}) {
    rejectUnsafeKeys(query);
    const unknown = Object.keys(query || {}).filter((k) => !LIST_ALLOWED.has(k));
    if (unknown.length) throw new ApiError(400, `Unknown filter fields: ${unknown.join(', ')}`);

    let status = null;
    if (query.status != null && String(query.status).trim() !== '') {
        status = assertQueryStatus(String(query.status).trim());
    }

    let sourceHint = null;
    if (query.sourceHint != null && String(query.sourceHint).trim() !== '') {
        sourceHint = assertSourceHint(query.sourceHint);
    }

    let queryType = null;
    if (query.queryType != null && String(query.queryType).trim() !== '') {
        queryType = assertQueryType(query.queryType);
    }

    let generationMethod = null;
    if (query.generationMethod != null && String(query.generationMethod).trim() !== '') {
        generationMethod = String(query.generationMethod).trim().toLowerCase();
        if (!['automatic', 'manual', 'regenerated'].includes(generationMethod)) {
            throw new ApiError(400, `Unsupported generationMethod: ${query.generationMethod}`);
        }
    }

    let page = Number(query.page || 1);
    let limit = Number(query.limit || SEARCH_QUERY_LIST_DEFAULT_LIMIT);
    if (!Number.isFinite(page) || page < 1 || Math.floor(page) !== page) {
        throw new ApiError(400, 'page must be a positive integer');
    }
    if (!Number.isFinite(limit) || limit < 1 || Math.floor(limit) !== limit) {
        throw new ApiError(400, 'limit must be a positive integer');
    }
    if (limit > SEARCH_QUERY_LIST_MAX_LIMIT) {
        throw new ApiError(400, `limit may not exceed ${SEARCH_QUERY_LIST_MAX_LIMIT}`);
    }

    let sort = String(query.sort || 'updatedAt').trim();
    if (!SEARCH_QUERY_SORT_FIELDS.includes(sort)) {
        throw new ApiError(400, `Unsupported sort field: ${sort}`);
    }
    const sortDirRaw = String(query.sortDir || 'desc').trim().toLowerCase();
    if (!['asc', 'desc'].includes(sortDirRaw)) {
        throw new ApiError(400, 'sortDir must be asc or desc');
    }

    const searchText = String(query.q || query.search || '').trim();
    if (searchText.length > 200) throw new ApiError(400, 'search text is too long');

    return {
        status,
        sourceHint,
        queryType,
        generationMethod,
        generationGroupId: String(query.generationGroupId || '').trim(),
        searchText,
        createdFrom: parseDate(query.createdFrom, 'createdFrom'),
        createdTo: parseDate(query.createdTo, 'createdTo'),
        updatedFrom: parseDate(query.updatedFrom, 'updatedFrom'),
        updatedTo: parseDate(query.updatedTo, 'updatedTo'),
        includeArchived: parseBool(query.includeArchived, 'includeArchived'),
        approvedOnly: parseBool(query.approvedOnly, 'approvedOnly'),
        page,
        limit,
        sort,
        sortDir: sortDirRaw === 'asc' ? 1 : -1,
    };
}

export { SEARCH_QUERY_FORBIDDEN_BODY };
