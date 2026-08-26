import { ApiError } from '../../../../utils/ApiError.js';
import {
    RAW_CAPTURE_ALLOWED_INGEST_METHODS,
    RAW_CAPTURE_BATCH_MAX,
    RAW_CAPTURE_FORBIDDEN_BODY,
    RAW_CAPTURE_IDEMPOTENCY_KEY_MAX,
    RAW_CAPTURE_INBOX_STATUSES,
    RAW_CAPTURE_LIST_DEFAULT_LIMIT,
    RAW_CAPTURE_LIST_MAX_LIMIT,
    RAW_CAPTURE_METHODS,
    RAW_CAPTURE_QUERY_SOURCE_HINTS,
    RAW_CAPTURE_RECORD_FORBIDDEN,
    RAW_CAPTURE_RESULT_TYPE_HINTS,
    RAW_CAPTURE_SORT_FIELDS,
    RAW_CAPTURE_SOURCES,
} from './constants.js';
import {
    looksLikeBinaryOrBase64,
    normalizeNotes,
    normalizeResultUrl,
    normalizeSnippet,
    normalizeSourceRecordId,
    normalizeTitle,
    normalizeTitleKey,
} from './normalize.util.js';

const INGEST_TOP_ALLOWED = new Set([
    'queryId', 'source', 'captureMethod', 'idempotencyKey', 'records', 'querySourceHint',
]);
const RECORD_ALLOWED = new Set([
    'title', 'snippet', 'resultUrl', 'resultPosition', 'sourceRecordId', 'resultTypeHint', 'notes',
]);
const LIST_ALLOWED = new Set([
    'queryId', 'source', 'querySourceHint', 'captureMethod', 'inboxStatus', 'resultTypeHint',
    'displayDomain', 'hasUrl', 'q', 'search', 'firstSeenFrom', 'firstSeenTo',
    'lastSeenFrom', 'lastSeenTo', 'batchId', 'includeArchived', 'page', 'limit', 'sort', 'sortDir',
]);

function rejectUnsafeKeys(obj = {}) {
    for (const key of Object.keys(obj || {})) {
        if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor') {
            throw new ApiError(400, `Unsafe key rejected: ${key}`);
        }
    }
}

function rejectForbidden(body, list, label) {
    const bad = Object.keys(body || {}).filter((k) => list.includes(k));
    if (bad.length) {
        throw new ApiError(400, `Do not send ${bad.join(', ')}; ${label}`);
    }
}

function parseBool(raw, field) {
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

export function validateIdempotencyKey(raw) {
    const key = String(raw || '').trim();
    if (!key) throw new ApiError(400, 'idempotencyKey is required');
    if (key.length > RAW_CAPTURE_IDEMPOTENCY_KEY_MAX) {
        throw new ApiError(400, `idempotencyKey must be at most ${RAW_CAPTURE_IDEMPOTENCY_KEY_MAX} characters`);
    }
    if (!/^[A-Za-z0-9._:-]+$/.test(key)) {
        throw new ApiError(400, 'idempotencyKey contains invalid characters');
    }
    return key;
}

export function validateIngestBody(body = {}) {
    rejectUnsafeKeys(body);
    rejectForbidden(body, RAW_CAPTURE_FORBIDDEN_BODY, 'company scope and audit fields come from auth');
    const unknown = Object.keys(body || {}).filter((k) => !INGEST_TOP_ALLOWED.has(k));
    if (unknown.length) throw new ApiError(400, `Unknown fields: ${unknown.join(', ')}`);

    const source = String(body.source || '').trim().toLowerCase();
    if (!RAW_CAPTURE_SOURCES.includes(source)) {
        throw new ApiError(400, `Unsupported source: ${body.source}`);
    }
    const captureMethod = String(body.captureMethod || '').trim().toLowerCase();
    if (!RAW_CAPTURE_METHODS.includes(captureMethod)) {
        throw new ApiError(400, `Unsupported captureMethod: ${body.captureMethod}`);
    }
    if (!RAW_CAPTURE_ALLOWED_INGEST_METHODS.includes(captureMethod)) {
        throw new ApiError(400, `Unsupported captureMethod: ${body.captureMethod}`);
    }
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey);
    const queryId = body.queryId != null && String(body.queryId).trim() !== ''
        ? String(body.queryId).trim()
        : null;

    let querySourceHint = '';
    if (body.querySourceHint != null && String(body.querySourceHint).trim() !== '') {
        querySourceHint = String(body.querySourceHint).trim().toLowerCase();
        if (!RAW_CAPTURE_QUERY_SOURCE_HINTS.includes(querySourceHint)) {
            throw new ApiError(400, `Unsupported querySourceHint: ${body.querySourceHint}`);
        }
    }

    if (!Array.isArray(body.records)) {
        throw new ApiError(400, 'records must be an array');
    }
    if (!body.records.length) throw new ApiError(400, 'records must not be empty');
    if (body.records.length > RAW_CAPTURE_BATCH_MAX) {
        throw new ApiError(400, `records may not exceed ${RAW_CAPTURE_BATCH_MAX}`);
    }

    return { source, captureMethod, idempotencyKey, queryId, querySourceHint, records: body.records };
}

/**
 * Normalize one record. Returns { ok, value } or { ok:false, message }.
 */
export function normalizeIngestRecord(raw = {}, index = 0) {
    try {
        if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
            return { ok: false, index, message: 'record must be an object' };
        }
        rejectUnsafeKeys(raw);
        const forbidden = Object.keys(raw).filter((k) => RAW_CAPTURE_RECORD_FORBIDDEN.includes(k));
        if (forbidden.length) {
            return { ok: false, index, message: `Do not send ${forbidden.join(', ')}` };
        }
        const unknown = Object.keys(raw).filter((k) => !RECORD_ALLOWED.has(k));
        if (unknown.length) {
            return { ok: false, index, message: `Unknown record fields: ${unknown.join(', ')}` };
        }

        const title = normalizeTitle(raw.title || '');
        const snippet = normalizeSnippet(raw.snippet || '');
        if (looksLikeBinaryOrBase64(title) || looksLikeBinaryOrBase64(snippet) || looksLikeBinaryOrBase64(raw.resultUrl || '')) {
            return { ok: false, index, message: 'binary/base64-like payload rejected' };
        }
        const urlParts = normalizeResultUrl(raw.resultUrl || '');
        if (!title && !snippet && !urlParts.original) {
            return { ok: false, index, message: 'record requires at least one of resultUrl, title, snippet' };
        }

        let resultPosition = null;
        if (raw.resultPosition != null && raw.resultPosition !== '') {
            const n = Number(raw.resultPosition);
            if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
                return { ok: false, index, message: 'resultPosition must be a non-negative integer' };
            }
            resultPosition = n;
        }

        let resultTypeHint = 'unknown';
        if (raw.resultTypeHint != null && String(raw.resultTypeHint).trim() !== '') {
            resultTypeHint = String(raw.resultTypeHint).trim().toLowerCase();
            if (!RAW_CAPTURE_RESULT_TYPE_HINTS.includes(resultTypeHint)) {
                return { ok: false, index, message: `Unsupported resultTypeHint: ${raw.resultTypeHint}` };
            }
        }

        const sourceRecordId = normalizeSourceRecordId(raw.sourceRecordId || '');
        const titleNormalized = normalizeTitleKey(title);
        const snippetNormalized = normalizeTitleKey(snippet);
        let notes = '';
        if (raw.notes != null && String(raw.notes).trim() !== '') {
            notes = normalizeNotes(raw.notes);
        }

        return {
            ok: true,
            index,
            value: {
                title,
                titleNormalized,
                snippet,
                snippetNormalized,
                resultUrlOriginal: urlParts.original,
                resultUrlNormalized: urlParts.normalized,
                displayDomain: urlParts.displayDomain,
                resultPosition,
                resultTypeHint,
                sourceRecordId,
                notes,
            },
        };
    } catch (err) {
        return { ok: false, index, message: err.message || 'invalid record' };
    }
}

export function validateNotesBody(body = {}) {
    rejectUnsafeKeys(body);
    rejectForbidden(body, RAW_CAPTURE_FORBIDDEN_BODY, 'audit and identity fields are server-derived');
    const allowed = new Set(['notes']);
    const unknown = Object.keys(body || {}).filter((k) => !allowed.has(k));
    if (unknown.length) throw new ApiError(400, `Unknown fields: ${unknown.join(', ')}`);
    if (!Object.prototype.hasOwnProperty.call(body || {}, 'notes')) {
        throw new ApiError(400, 'notes is required');
    }
    return { notes: normalizeNotes(body.notes) };
}

export function validateListQuery(query = {}) {
    rejectUnsafeKeys(query);
    const unknown = Object.keys(query || {}).filter((k) => !LIST_ALLOWED.has(k));
    if (unknown.length) throw new ApiError(400, `Unknown filter fields: ${unknown.join(', ')}`);

    let page = Number(query.page || 1);
    let limit = Number(query.limit || RAW_CAPTURE_LIST_DEFAULT_LIMIT);
    if (!Number.isFinite(page) || page < 1 || Math.floor(page) !== page) {
        throw new ApiError(400, 'page must be a positive integer');
    }
    if (!Number.isFinite(limit) || limit < 1 || Math.floor(limit) !== limit) {
        throw new ApiError(400, 'limit must be a positive integer');
    }
    if (limit > RAW_CAPTURE_LIST_MAX_LIMIT) {
        throw new ApiError(400, `limit may not exceed ${RAW_CAPTURE_LIST_MAX_LIMIT}`);
    }

    let sort = String(query.sort || 'lastSeenAt').trim();
    if (!RAW_CAPTURE_SORT_FIELDS.includes(sort)) {
        throw new ApiError(400, `Unsupported sort field: ${sort}`);
    }
    const sortDirRaw = String(query.sortDir || 'desc').trim().toLowerCase();
    if (!['asc', 'desc'].includes(sortDirRaw)) {
        throw new ApiError(400, 'sortDir must be asc or desc');
    }

    let inboxStatus = null;
    if (query.inboxStatus != null && String(query.inboxStatus).trim() !== '') {
        inboxStatus = String(query.inboxStatus).trim().toLowerCase();
        if (!RAW_CAPTURE_INBOX_STATUSES.includes(inboxStatus)) {
            throw new ApiError(400, `Unsupported inboxStatus: ${query.inboxStatus}`);
        }
    }

    const searchText = String(query.q || query.search || '').trim();
    if (searchText.length > 200) throw new ApiError(400, 'search text is too long');

    return {
        queryId: query.queryId ? String(query.queryId).trim() : null,
        source: query.source ? String(query.source).trim().toLowerCase() : null,
        querySourceHint: query.querySourceHint ? String(query.querySourceHint).trim().toLowerCase() : null,
        captureMethod: query.captureMethod ? String(query.captureMethod).trim().toLowerCase() : null,
        inboxStatus,
        resultTypeHint: query.resultTypeHint ? String(query.resultTypeHint).trim().toLowerCase() : null,
        displayDomain: query.displayDomain ? String(query.displayDomain).trim().toLowerCase() : null,
        hasUrl: query.hasUrl == null || query.hasUrl === '' ? null : parseBool(query.hasUrl, 'hasUrl'),
        searchText,
        firstSeenFrom: parseDate(query.firstSeenFrom, 'firstSeenFrom'),
        firstSeenTo: parseDate(query.firstSeenTo, 'firstSeenTo'),
        lastSeenFrom: parseDate(query.lastSeenFrom, 'lastSeenFrom'),
        lastSeenTo: parseDate(query.lastSeenTo, 'lastSeenTo'),
        batchId: query.batchId ? String(query.batchId).trim() : null,
        includeArchived: parseBool(query.includeArchived, 'includeArchived'),
        page,
        limit,
        sort,
        sortDir: sortDirRaw === 'asc' ? 1 : -1,
    };
}
