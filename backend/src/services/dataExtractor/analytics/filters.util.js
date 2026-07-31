import crypto from 'crypto';
import { ApiError } from '../../../utils/ApiError.js';
import { DEFAULT_SETTINGS } from './constants.js';

export function assertNoSecrets(obj) {
    const blob = JSON.stringify(obj || {});
    if (/password|cookie|authorization|bearer\s|sessiontoken|sk-[a-z0-9]|openai_api_key|api[_-]?key|data:image\/|base64,/i.test(blob)) {
        const err = new Error('Refusing to store or return secret/session/media values');
        err.statusCode = 500;
        throw err;
    }
}

function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function endOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

function currentFyBounds(now = new Date()) {
    const y = now.getFullYear();
    const m = now.getMonth();
    const startYear = m >= 3 ? y : y - 1;
    return {
        from: new Date(startYear, 3, 1, 0, 0, 0, 0),
        to: new Date(startYear + 1, 2, 31, 23, 59, 59, 999),
    };
}

export function resolveDateRange(preset, customFrom, customTo) {
    const now = new Date();
    const key = String(preset || DEFAULT_SETTINGS.defaultDateRange || 'last_30_days').trim();
    let from;
    let to = endOfDay(now);

    switch (key) {
        case 'today':
            from = startOfDay(now);
            break;
        case 'yesterday': {
            const y = new Date(now);
            y.setDate(y.getDate() - 1);
            from = startOfDay(y);
            to = endOfDay(y);
            break;
        }
        case 'last_7_days': {
            const d = new Date(now);
            d.setDate(d.getDate() - 6);
            from = startOfDay(d);
            break;
        }
        case 'last_30_days': {
            const d = new Date(now);
            d.setDate(d.getDate() - 29);
            from = startOfDay(d);
            break;
        }
        case 'current_month':
            from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            break;
        case 'previous_month': {
            from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
            to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            break;
        }
        case 'current_fy': {
            const fy = currentFyBounds(now);
            from = fy.from;
            to = fy.to;
            break;
        }
        case 'custom': {
            if (!customFrom || !customTo) {
                throw new ApiError(400, 'custom date range requires from and to');
            }
            from = startOfDay(new Date(customFrom));
            to = endOfDay(new Date(customTo));
            if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
                throw new ApiError(400, 'Invalid custom date range');
            }
            if (from > to) throw new ApiError(400, 'date from must be <= to');
            break;
        }
        default: {
            const d = new Date(now);
            d.setDate(d.getDate() - 29);
            from = startOfDay(d);
        }
    }
    return { preset: key, from, to };
}

function pickStr(v) {
    if (v == null || v === '') return undefined;
    return String(v).trim();
}

function pickBool(v) {
    if (v === true || v === 'true' || v === '1') return true;
    if (v === false || v === 'false' || v === '0') return false;
    return undefined;
}

function pickNum(v) {
    if (v == null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse analytics query filters. Rejects companyId/tenantId overrides.
 */
export function parseAnalyticsFilters(query = {}) {
    if (query.companyId != null || query.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
    const datePreset = pickStr(query.dateRange || query.datePreset || query.range) || DEFAULT_SETTINGS.defaultDateRange;
    const dateRange = resolveDateRange(datePreset, query.from || query.dateFrom, query.to || query.dateTo);
    const dateField = ['createdAt', 'updatedAt', 'appliedAt', 'generatedAt', 'extractedAt'].includes(String(query.dateField || ''))
        ? String(query.dateField)
        : 'createdAt';

    const filters = {
        datePreset: dateRange.preset,
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
        dateField,
        financialYear: pickStr(query.financialYear || query.fy),
        source: pickStr(query.source || query.sourcePlatform || query.provider),
        discoveryJobId: pickStr(query.discoveryJobId || query.jobId),
        industry: pickStr(query.industry || query.primaryIndustry),
        parentIndustry: pickStr(query.parentIndustry),
        subIndustry: pickStr(query.subIndustry),
        customerType: pickStr(query.customerType),
        city: pickStr(query.city),
        state: pickStr(query.state || query.stateProvince),
        country: pickStr(query.country),
        product: pickStr(query.product || query.productOpportunity),
        priority: pickStr(query.priority),
        grade: pickStr(query.grade),
        status: pickStr(query.status),
        locked: pickBool(query.locked),
        outdated: pickBool(query.outdated),
        engineUsed: pickStr(query.engineUsed || query.engine),
        scoreMin: pickNum(query.scoreMin),
        scoreMax: pickNum(query.scoreMax),
        confidenceMin: pickNum(query.confidenceMin),
        confidenceMax: pickNum(query.confidenceMax),
        assignedTo: pickStr(query.assignedTo || query.salesperson),
        contactAvailability: pickStr(query.contactAvailability),
        crmConversionStatus: pickStr(query.crmConversionStatus),
        batchStatus: pickStr(query.batchStatus),
        trendGroup: pickStr(query.trendGroup) || 'day',
    };

    assertNoSecrets(filters);
    return filters;
}

/**
 * Build a company-scoped Mongo match from analytics filters.
 * @param {object} [opts]
 * @param {'lead'|'intel'|'tx'|'batch'|'job'} [opts.mode]
 */
export function buildMatch(companyId, filters = {}, opts = {}) {
    const mode = opts.mode || 'intel';
    const match = { companyId };
    if (mode !== 'lead') {
        match.isDeleted = { $ne: true };
    }

    const dateField = filters.dateField || 'createdAt';
    if (filters.dateFrom || filters.dateTo) {
        match[dateField] = {};
        if (filters.dateFrom) match[dateField].$gte = new Date(filters.dateFrom);
        if (filters.dateTo) match[dateField].$lte = new Date(filters.dateTo);
    }

    if (filters.financialYear) match.financialYear = filters.financialYear;

    if (filters.source) {
        if (mode === 'lead') match.sourcePlatform = filters.source;
        else if (mode === 'job') match.selectedSources = filters.source;
        else match.$or = [
            ...(match.$or || []),
        ];
        // Prefer explicit fields when present on intel models
        if (mode === 'intel') {
            delete match.$or;
            // many intel docs do not store sourcePlatform; discoveryJobId is safer
        }
    }

    if (filters.discoveryJobId) {
        match.discoveryJobId = filters.discoveryJobId;
    }

    if (filters.industry) {
        match.$or = [
            { primaryIndustry: filters.industry },
            { parentIndustry: filters.industry },
            { selectedIndustry: filters.industry },
        ];
    }
    if (filters.parentIndustry) match.parentIndustry = filters.parentIndustry;
    if (filters.subIndustry) match.subIndustry = filters.subIndustry;
    if (filters.customerType) match.customerType = filters.customerType;

    if (filters.city) {
        if (mode === 'lead') match.city = filters.city;
        else match['geographicProximity.city'] = filters.city;
    }
    if (filters.state) {
        if (mode === 'lead') match.stateProvince = filters.state;
    }
    if (filters.country) {
        if (mode === 'lead') match.country = filters.country;
    }

    if (filters.priority) match.priority = filters.priority;
    if (filters.grade) match.grade = filters.grade;
    if (filters.status) match.status = filters.status;
    if (filters.locked === true) match.locked = true;
    if (filters.locked === false) match.locked = { $ne: true };
    if (filters.outdated === true) match.status = 'OUTDATED';
    if (filters.engineUsed) match.engineUsed = filters.engineUsed;

    if (filters.scoreMin != null || filters.scoreMax != null) {
        const scoreField = opts.scoreField || 'finalScore';
        match[scoreField] = {};
        if (filters.scoreMin != null) match[scoreField].$gte = filters.scoreMin;
        if (filters.scoreMax != null) match[scoreField].$lte = filters.scoreMax;
    }

    if (filters.confidenceMin != null || filters.confidenceMax != null) {
        const cf = opts.confidenceField || 'confidence';
        match[cf] = {};
        if (filters.confidenceMin != null) match[cf].$gte = filters.confidenceMin;
        if (filters.confidenceMax != null) match[cf].$lte = filters.confidenceMax;
    }

    if (filters.assignedTo && mode === 'tx') {
        match['appliedValues.assignedTo'] = String(filters.assignedTo);
    }

    if (filters.batchStatus && (mode === 'batch' || mode === 'job')) {
        match.status = filters.batchStatus;
    }

    return match;
}

export function pct(n, d) {
    const num = Number(n) || 0;
    const den = Number(d) || 0;
    if (den <= 0) return 0;
    return Math.round((num / den) * 10000) / 100;
}

export function fingerprint(filters = {}) {
    const stable = {
        datePreset: filters.datePreset,
        dateFrom: filters.dateFrom ? new Date(filters.dateFrom).toISOString() : null,
        dateTo: filters.dateTo ? new Date(filters.dateTo).toISOString() : null,
        dateField: filters.dateField,
        financialYear: filters.financialYear || '',
        source: filters.source || '',
        discoveryJobId: filters.discoveryJobId || '',
        industry: filters.industry || '',
        parentIndustry: filters.parentIndustry || '',
        subIndustry: filters.subIndustry || '',
        customerType: filters.customerType || '',
        city: filters.city || '',
        state: filters.state || '',
        country: filters.country || '',
        product: filters.product || '',
        priority: filters.priority || '',
        grade: filters.grade || '',
        status: filters.status || '',
        locked: filters.locked,
        outdated: filters.outdated,
        engineUsed: filters.engineUsed || '',
        scoreMin: filters.scoreMin,
        scoreMax: filters.scoreMax,
        assignedTo: filters.assignedTo || '',
        batchStatus: filters.batchStatus || '',
    };
    return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 32);
}

export function filterSummary(filters = {}) {
    return {
        datePreset: filters.datePreset,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        financialYear: filters.financialYear || null,
        source: filters.source || null,
        industry: filters.industry || null,
        customerType: filters.customerType || null,
        priority: filters.priority || null,
        status: filters.status || null,
    };
}