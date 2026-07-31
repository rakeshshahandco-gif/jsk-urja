import { ApiError } from '../../../utils/ApiError.js';
import { ALLOWED_FILTER_KEYS } from './constants.js';
import { fingerprint } from './normalize.util.js';

const UNSAFE_OPS = new Set(['$where', '$function', '$accumulator', '$expr', '$jsonSchema', '$regex']);

/**
 * Validate audience filters — whitelist keys only; reject arbitrary Mongo operators.
 */
export function validateAudienceFilters(raw = {}) {
    if (raw == null) return {};
    if (typeof raw !== 'object' || Array.isArray(raw)) {
        throw new ApiError(400, 'audienceFilters must be an object');
    }
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
        if (key.startsWith('$') || UNSAFE_OPS.has(key)) {
            throw new ApiError(400, `Unsafe filter operator rejected: ${key}`);
        }
        if (!ALLOWED_FILTER_KEYS.includes(key)) {
            throw new ApiError(400, `Unknown/unsafe filter rejected: ${key}`);
        }
        if (value != null && typeof value === 'object' && !Array.isArray(value)) {
            for (const op of Object.keys(value)) {
                if (op.startsWith('$') || UNSAFE_OPS.has(op)) {
                    throw new ApiError(400, `Unsafe nested filter operator rejected: ${op}`);
                }
            }
        }
        out[key] = value;
    }
    return out;
}

export function audienceFilterFingerprint(filters = {}) {
    const keys = Object.keys(filters).sort();
    return fingerprint(keys.map((k) => `${k}=${JSON.stringify(filters[k])}`));
}

/** Build a safe ExtractedLead query from validated filters (AND semantics). */
export function buildExtractedLeadQuery(companyId, filters = {}) {
    const q = {
        companyId,
        isDeleted: { $ne: true },
    };
    if (filters.extractedLeadStatus) {
        q.status = filters.extractedLeadStatus;
    } else {
        // Default: exclude rejected/duplicate for audience prep
        q.status = { $nin: ['rejected', 'duplicate'] };
    }
    if (filters.industry) q.industry = filters.industry;
    if (filters.subIndustry) q.subIndustry = filters.subIndustry;
    if (filters.customerType) q.customerType = filters.customerType;
    if (filters.country) q.country = filters.country;
    if (filters.state) q.state = filters.state;
    if (filters.city) q.city = filters.city;
    if (filters.district) q.district = filters.district;
    if (filters.pinCode) q.pinCode = filters.pinCode;
    if (filters.discoverySource) q.source = filters.discoverySource;
    if (filters.approved === true) q.status = 'approved';
    if (filters.locked === true) q.locked = true;
    if (filters.locked === false) q.locked = { $ne: true };
    return q;
}
