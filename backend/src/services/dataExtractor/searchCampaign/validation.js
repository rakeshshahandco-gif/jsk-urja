/**
 * Thin validation entrypoints used by the SearchCampaign controller.
 */
import { ApiError } from '../../../utils/ApiError.js';
import {
    SEARCH_CAMPAIGN_LIST_DEFAULT_LIMIT,
    SEARCH_CAMPAIGN_LIST_MAX_LIMIT,
    SEARCH_CAMPAIGN_SORT_FIELDS,
    SEARCH_CAMPAIGN_STATUSES,
} from './constants.js';
import {
    assertValidStatus,
    buildCreatePayload,
    pickWritablePayload,
    rejectForbiddenBodyFields,
} from './normalize.util.js';

const LIST_ALLOWED_QUERY_KEYS = new Set([
    'status',
    'targetIndustry',
    'source',
    'q',
    'search',
    'createdFrom',
    'createdTo',
    'updatedFrom',
    'updatedTo',
    'includeArchived',
    'page',
    'limit',
    'sort',
    'sortDir',
]);

function parseBool(raw) {
    if (raw === true || raw === 'true' || raw === '1') return true;
    if (raw === false || raw === 'false' || raw === '0' || raw == null || raw === '') return false;
    throw new ApiError(400, 'includeArchived must be a boolean');
}

function parseDate(raw, field) {
    if (raw == null || raw === '') return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) throw new ApiError(400, `Invalid ${field}`);
    return d;
}

export function validateCreateBody(body = {}) {
    rejectForbiddenBodyFields(body);
    if (Object.prototype.hasOwnProperty.call(body || {}, 'status')) {
        throw new ApiError(400, 'Do not set status on create; new campaigns start as draft. Use the status endpoint to change status.');
    }
    return buildCreatePayload(body);
}

export function validateUpdateBody(body = {}) {
    rejectForbiddenBodyFields(body);
    if (Object.prototype.hasOwnProperty.call(body || {}, 'status')) {
        throw new ApiError(400, 'Do not set status on update; use the status or archive endpoint');
    }
    const payload = pickWritablePayload(body);
    if (!Object.keys(payload).length) {
        throw new ApiError(400, 'No updatable fields provided');
    }
    return payload;
}

export function validateStatusBody(body = {}) {
    rejectForbiddenBodyFields(body);
    const allowed = new Set(['status']);
    const unknown = Object.keys(body || {}).filter((k) => !allowed.has(k));
    if (unknown.length) throw new ApiError(400, `Unknown fields: ${unknown.join(', ')}`);
    if (!body || body.status == null || body.status === '') {
        throw new ApiError(400, 'status is required');
    }
    return { status: assertValidStatus(String(body.status).trim()) };
}

export function validateListQuery(query = {}) {
    const unknown = Object.keys(query || {}).filter((k) => !LIST_ALLOWED_QUERY_KEYS.has(k));
    if (unknown.length) {
        throw new ApiError(400, `Unknown filter fields: ${unknown.join(', ')}`);
    }
    for (const key of Object.keys(query || {})) {
        if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor') {
            throw new ApiError(400, `Unsafe filter key rejected: ${key}`);
        }
    }

    let status = null;
    if (query.status != null && String(query.status).trim() !== '') {
        status = assertValidStatus(String(query.status).trim());
    }

    const includeArchived = parseBool(query.includeArchived);
    let page = Number(query.page || 1);
    let limit = Number(query.limit || SEARCH_CAMPAIGN_LIST_DEFAULT_LIMIT);
    if (!Number.isFinite(page) || page < 1 || Math.floor(page) !== page) {
        throw new ApiError(400, 'page must be a positive integer');
    }
    if (!Number.isFinite(limit) || limit < 1 || Math.floor(limit) !== limit) {
        throw new ApiError(400, 'limit must be a positive integer');
    }
    if (limit > SEARCH_CAMPAIGN_LIST_MAX_LIMIT) {
        throw new ApiError(400, `limit may not exceed ${SEARCH_CAMPAIGN_LIST_MAX_LIMIT}`);
    }

    let sort = String(query.sort || 'updatedAt').trim();
    if (!SEARCH_CAMPAIGN_SORT_FIELDS.includes(sort)) {
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
        targetIndustry: String(query.targetIndustry || '').trim(),
        source: String(query.source || '').trim(),
        searchText,
        createdFrom: parseDate(query.createdFrom, 'createdFrom'),
        createdTo: parseDate(query.createdTo, 'createdTo'),
        updatedFrom: parseDate(query.updatedFrom, 'updatedFrom'),
        updatedTo: parseDate(query.updatedTo, 'updatedTo'),
        includeArchived,
        page,
        limit,
        sort,
        sortDir: sortDirRaw === 'asc' ? 1 : -1,
    };
}

export { SEARCH_CAMPAIGN_STATUSES };