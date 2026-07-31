import { CLASSIFICATION_STATUSES } from './constants.js';

export function validateAiClassificationOutput(aiResult, masters = {}, companyId = null) {
    const errors = [];
    const raw = aiResult?.raw || {};
    const industryIds = new Set((masters.industries || []).map((x) => String(x._id)));
    const customerTypeIds = new Set((masters.customerTypes || []).map((x) => String(x._id)));

    const primaryIndustryId = raw.primaryIndustryId ? String(raw.primaryIndustryId) : '';
    if (primaryIndustryId && !industryIds.has(primaryIndustryId)) {
        errors.push('primaryIndustryId not in company Industry Master');
    }
    const secondary = Array.isArray(raw.secondaryIndustryIds) ? raw.secondaryIndustryIds.map(String) : [];
    for (const id of secondary) {
        if (!industryIds.has(id)) errors.push('secondaryIndustryId not in company Industry Master: ' + id);
    }
    const customerTypeId = raw.customerTypeId ? String(raw.customerTypeId) : '';
    if (customerTypeId && !customerTypeIds.has(customerTypeId)) {
        errors.push('customerTypeId not in company Customer Type Master');
    }

    const status = String(raw.status || '').toUpperCase();
    if (status && !CLASSIFICATION_STATUSES.includes(status)) {
        errors.push('unsupported status: ' + status);
    }

    const confidence = Number(raw.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
        errors.push('confidence must be 0-100');
    }

    const evidence = Array.isArray(raw.evidence) ? raw.evidence.map(String).filter(Boolean) : [];
    if (!evidence.length && status === 'CLASSIFIED') {
        errors.push('CLASSIFIED requires evidence');
    }

    const bannedKeys = ['gstin', 'revenue', 'employeeCount', 'exportMarkets', 'certificationsInvented', 'customerNames'];
    for (const k of bannedKeys) {
        if (raw[k] != null && raw[k] !== '' && !(Array.isArray(raw[k]) && !raw[k].length)) {
            errors.push('AI invented unsupported field: ' + k);
        }
    }

    if (companyId && raw.companyId && String(raw.companyId) !== String(companyId)) {
        errors.push('AI returned foreign companyId');
    }

    return {
        ok: errors.length === 0,
        errors,
        normalized: {
            primaryIndustryId: primaryIndustryId || null,
            secondaryIndustryIds: secondary.filter((id) => industryIds.has(id)),
            customerTypeId: customerTypeId || null,
            status: CLASSIFICATION_STATUSES.includes(status) ? status : 'MANUAL_REVIEW_REQUIRED',
            confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 0,
            evidence,
            keywordsFound: Array.isArray(raw.keywordsFound) ? raw.keywordsFound.map((x) => String(x).toLowerCase()) : [],
            manualReviewReason: String(raw.manualReviewReason || ''),
        },
    };
}
