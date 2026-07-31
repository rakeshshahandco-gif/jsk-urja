import { ApiError } from '../../../../utils/ApiError.js';
import { IMPORT_COLUMN_ALIASES, IMPORT_MAP_TARGETS } from './constants.js';

export function normalizeHeaderKey(raw = '') {
    return String(raw || '')
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[_/\\|]+/g, ' ')
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function analyzeHeaders(headers = []) {
    const original = headers.map((h) => String(h ?? ''));
    const normalized = original.map(normalizeHeaderKey);
    const duplicates = [];
    const seen = new Map();
    normalized.forEach((n, i) => {
        if (!n) return;
        if (seen.has(n)) duplicates.push({ normalized: n, indexes: [seen.get(n), i], labels: [original[seen.get(n)], original[i]] });
        else seen.set(n, i);
    });
    return { original, normalized, duplicates };
}

export function suggestMapping(headers = []) {
    const { original, normalized } = analyzeHeaders(headers);
    const mapping = {};
    const usedTargets = new Set();
    for (const target of IMPORT_MAP_TARGETS) {
        const aliases = IMPORT_COLUMN_ALIASES[target] || [];
        for (let i = 0; i < normalized.length; i += 1) {
            if (aliases.includes(normalized[i]) && !usedTargets.has(target)) {
                mapping[target] = original[i];
                usedTargets.add(target);
                break;
            }
        }
    }
    return mapping;
}

function rejectUnsafeKeys(obj = {}) {
    for (const key of Object.keys(obj || {})) {
        if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
            throw new ApiError(400, `Unsafe mapping key rejected: ${key}`);
        }
    }
}

/**
 * Validate explicit columnMapping: { targetField: sourceColumnName }
 */
export function validateColumnMapping(columnMapping = {}, availableColumns = []) {
    if (!columnMapping || typeof columnMapping !== 'object' || Array.isArray(columnMapping)) {
        throw new ApiError(400, 'columnMapping must be an object');
    }
    rejectUnsafeKeys(columnMapping);
    const available = new Set((availableColumns || []).map(String));
    const targetsUsed = new Set();
    const sourcesUsed = new Set();
    const cleaned = {};
    for (const [target, source] of Object.entries(columnMapping)) {
        if (source == null || String(source).trim() === '') continue;
        if (!IMPORT_MAP_TARGETS.includes(target)) {
            throw new ApiError(400, `Unknown mapping target: ${target}`);
        }
        if (targetsUsed.has(target)) throw new ApiError(400, `Duplicate mapping target: ${target}`);
        const src = String(source);
        if (!available.has(src)) throw new ApiError(400, `Mapped column not found: ${src}`);
        if (sourcesUsed.has(src)) throw new ApiError(400, `Source column mapped more than once: ${src}`);
        targetsUsed.add(target);
        sourcesUsed.add(src);
        cleaned[target] = src;
    }
    if (!cleaned.resultUrl && !cleaned.title && !cleaned.snippet) {
        throw new ApiError(400, 'columnMapping must include at least one of resultUrl, title, snippet');
    }
    return cleaned;
}

export function applyMapping(rowObj = {}, columnMapping = {}) {
    const out = {};
    for (const [target, source] of Object.entries(columnMapping || {})) {
        const val = rowObj[source];
        out[target] = val == null ? '' : val;
    }
    return out;
}
