import { ApiError } from '../../../utils/ApiError.js';
import { IntelligenceConfigurationValidation } from '../../../models/intelligenceConfigurationValidation.model.js';
import { assertPayloadSafe, assertNoSecrets } from './normalize.util.js';
import { ENGINE_VERSION } from './constants.js';
import { getSettings } from './settings.service.js';

function collectNumbers(obj, path, out) {
    if (obj == null) return;
    if (typeof obj === 'number') {
        out.push({ path, value: obj });
        return;
    }
    if (Array.isArray(obj)) {
        obj.forEach((v, i) => collectNumbers(v, `${path}[${i}]`, out));
        return;
    }
    if (typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) collectNumbers(v, path ? `${path}.${k}` : k, out);
    }
}

export function validatePayloadSchema(familyCode, payload, settings = {}) {
    const errors = [];
    const warnings = [];
    try {
        assertPayloadSafe(payload);
    } catch (err) {
        errors.push({ code: 'UNSAFE_CONTENT', message: err.message });
        return { status: 'FAIL', errors, warnings };
    }

    const nums = [];
    collectNumbers(payload, '', nums);
    for (const n of nums) {
        if (n.value < 0) errors.push({ code: 'NEGATIVE_VALUE', path: n.path, message: `Negative value not allowed at ${n.path}` });
    }

    if (familyCode === 'LEAD_SCORE_WEIGHTS' || familyCode?.includes('WEIGHT')) {
        const weights = payload?.weights || payload?.dimensions || payload;
        if (weights && typeof weights === 'object' && !Array.isArray(weights)) {
            const vals = Object.values(weights).filter((v) => typeof v === 'number');
            if (vals.some((v) => v < 0 || v > 1)) {
                errors.push({ code: 'INVALID_WEIGHT', message: 'Weights must be between 0 and 1' });
            }
            const total = vals.reduce((a, b) => a + b, 0);
            if (vals.length && Math.abs(total - 1) > 0.05) {
                warnings.push({ code: 'WEIGHT_TOTAL', message: `Weight total is ${total.toFixed(3)}; expected ~1.0` });
            }
        }
    }

    if (familyCode?.includes('THRESHOLD') || familyCode === 'LEAD_PRIORITY_BANDS') {
        const bands = payload?.bands || payload?.thresholds || payload?.order;
        if (Array.isArray(bands)) {
            let prev = -Infinity;
            for (let i = 0; i < bands.length; i += 1) {
                const v = typeof bands[i] === 'number' ? bands[i] : bands[i]?.min ?? bands[i]?.value;
                if (typeof v === 'number') {
                    if (v < prev) errors.push({ code: 'THRESHOLD_ORDER', message: `Threshold order invalid at index ${i}` });
                    prev = v;
                }
            }
        }
        if (payload?.min != null && payload?.max != null && Number(payload.min) > Number(payload.max)) {
            errors.push({ code: 'THRESHOLD_ORDER', message: 'min must be <= max' });
        }
        if (payload?.low != null && payload?.high != null && Number(payload.low) > Number(payload.high)) {
            errors.push({ code: 'THRESHOLD_ORDER', message: 'low must be <= high' });
        }
    }

    if (familyCode === 'PRODUCT_RECOMMENDATION_MAPPINGS' || familyCode === 'PRODUCT_FIT_THRESHOLDS') {
        const refs = payload?.productIds || payload?.products || [];
        const missing = (Array.isArray(refs) ? refs : []).filter((r) => r && r.missing === true);
        const policy = settings.missingProductMasterPolicy || 'REJECT';
        if (missing.length) {
            const msg = { code: 'MISSING_PRODUCT_MASTER', message: `${missing.length} product master reference(s) missing` };
            if (policy === 'REJECT') errors.push(msg);
            else warnings.push(msg);
        }
    }

    if (payload?.industries) {
        const inactive = (Array.isArray(payload.industries) ? payload.industries : [])
            .filter((i) => i && (i.active === false || i.status === 'INACTIVE'));
        if (inactive.length) {
            const msg = { code: 'INACTIVE_INDUSTRY', message: 'Inactive industry reference present' };
            if ((settings.missingIndustryPolicy || 'WARN') === 'REJECT') errors.push(msg);
            else warnings.push(msg);
        }
    }

    if (payload?.mappings && Array.isArray(payload.mappings)) {
        const keys = payload.mappings.map((m) => JSON.stringify(m?.from ?? m?.key ?? m));
        const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
        if (dup.length) errors.push({ code: 'DUPLICATE_MAPPING', message: 'Duplicate mapping conditions detected' });
    }

    const status = errors.length ? 'FAIL' : (warnings.length ? 'PASS_WITH_WARNINGS' : 'PASS');
    return { status, errors, warnings };
}

export async function runValidation(companyId, versionDoc, userId, familyCode) {
    const settings = await getSettings(companyId);
    const result = validatePayloadSchema(familyCode, versionDoc.configurationPayload || {}, settings);
    assertNoSecrets(result);
    const record = await IntelligenceConfigurationValidation.create({
        companyId,
        versionId: versionDoc._id,
        status: result.status,
        errorItems: result.errors,
        warningItems: result.warnings,
        validatedBy: userId,
        engineVersion: ENGINE_VERSION,
    });
    return { ...result, validationId: record._id };
}

export function assertValidationPassed(result, allowWarnings = true) {
    if (result.status === 'FAIL') {
        throw new ApiError(400, `Validation failed: ${(result.errors || []).map((e) => e.code).join(', ')}`);
    }
    if (!allowWarnings && result.status === 'PASS_WITH_WARNINGS') {
        throw new ApiError(400, 'Validation has warnings and policy forbids proceeding');
    }
}
