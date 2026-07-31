import { ApiError } from '../../../utils/ApiError.js';
import { READ_ONLY_TOOLS, WRITE_TOOL_NAMES } from './constants.js';
import { clampLimit } from './normalize.util.js';

const UNSAFE_FILTER_KEYS = new Set([
    '$where', '$regex', '$expr', '$function', '$accumulator', '$jsonSchema',
    '__proto__', 'constructor', 'prototype',
]);

function walkUnsafe(obj, path = '') {
    if (obj == null || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i += 1) {
            const hit = walkUnsafe(obj[i], `${path}[${i}]`);
            if (hit) return hit;
        }
        return null;
    }
    for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith('$') || UNSAFE_FILTER_KEYS.has(k)) return `Unsafe filter key: ${k}`;
        if (typeof v === 'string' && /(\bSELECT\b|\bDROP\b|\bINSERT\b|;|--|function\s*\(|=>)/i.test(v)) {
            return `Unsafe filter expression at ${path}.${k}`;
        }
        const hit = walkUnsafe(v, `${path}.${k}`);
        if (hit) return hit;
    }
    return null;
}

export function validateQueryPlan(plan, settings) {
    if (!plan || typeof plan !== 'object') {
        throw new ApiError(400, 'Invalid query plan');
    }
    if (plan.companyId != null || plan.tenantId != null) {
        throw new ApiError(400, 'Query plan must not include companyId/tenantId');
    }
    const tools = Array.isArray(plan.tools) ? plan.tools : [];
    for (const t of tools) {
        if (WRITE_TOOL_NAMES.includes(t) || /create|update|delete|assign|send|execute|apply|approve|rollback|merge/i.test(t)) {
            throw new ApiError(400, `Write tool rejected: ${t}`);
        }
        if (!READ_ONLY_TOOLS.includes(t)) {
            throw new ApiError(400, `Unknown tool rejected: ${t}`);
        }
    }
    const unsafe = walkUnsafe(plan.filters || {});
    if (unsafe) throw new ApiError(400, unsafe);

    const max = settings?.maximumResultLimit || 100;
    const def = settings?.defaultResultLimit || 20;
    plan.limit = clampLimit(plan.limit, def, max);

    if (plan.limit > max) {
        throw new ApiError(400, `Excessive limit rejected (max ${max})`);
    }

    return {
        ...plan,
        tools,
        validated: true,
        validatedAt: new Date().toISOString(),
    };
}

/** Standalone validation endpoint helper. */
export function validateQueryPlanPayload(payload, settings) {
    return validateQueryPlan(payload?.plan || payload, settings);
}
