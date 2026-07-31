import { ENGINE_VERSION } from './constants.js';

export function getConfiguredAiProvider() {
    const key = String(process.env.EXTRACTOR_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
    const model = String(process.env.EXTRACTOR_OPENAI_MODEL || 'gpt-4o-mini').trim();
    if (!key) return { available: false, provider: '', model: '', reason: 'AI key not configured' };
    return { available: true, provider: 'openai', model, reason: '' };
}

export async function enrichSimilarityWithAi() {
    const cfg = getConfiguredAiProvider();
    if (!cfg.available) return { ok: false, fallback: true, reason: cfg.reason, result: null };
    return {
        ok: false,
        fallback: true,
        reason: 'AI enrichment unavailable; using rule engine',
        result: null,
        modelProvider: cfg.provider,
        modelVersion: cfg.model || ENGINE_VERSION,
    };
}

const ALLOWED_RELATIONSHIPS = new Set([
    'SIMILAR_COMPANY', 'INDUSTRY_PEER', 'POSSIBLE_COMPETITOR', 'POSSIBLE_CUSTOMER', 'POSSIBLE_SUPPLIER',
    'POSSIBLE_DEALER', 'POSSIBLE_DISTRIBUTOR', 'POSSIBLE_OEM', 'POSSIBLE_SYSTEM_INTEGRATOR',
    'POSSIBLE_CONSULTANT', 'POSSIBLE_PARTNER', 'RELATED_COMPANY', 'POSSIBLE_PARENT', 'POSSIBLE_SUBSIDIARY',
    'POSSIBLE_SISTER_CONCERN', 'POSSIBLE_BRANCH', 'GROUP_COMPANY_VARIANT', 'UNRELATED', 'MANUAL_REVIEW_REQUIRED',
]);

/**
 * AI may only explain / re-label using allowed candidate names and statuses.
 * Cannot invent companies or definite competitor/parent claims without POSSIBLE_ prefix where required.
 */
export function validateAiSimilarityOutput(aiResult, allowed = {}) {
    if (!aiResult || typeof aiResult !== 'object') return { ok: false, reason: 'malformed' };
    if (aiResult.candidateCompanyName) {
        const allowedNames = (allowed.candidateNames || []).map((x) => String(x).toLowerCase());
        if (allowedNames.length && !allowedNames.includes(String(aiResult.candidateCompanyName).toLowerCase())) {
            return { ok: false, reason: 'invented_candidate_company' };
        }
    }
    if (aiResult.relationshipType && !ALLOWED_RELATIONSHIPS.has(aiResult.relationshipType)) {
        return { ok: false, reason: 'invalid_relationship_type' };
    }
    if (['COMPETITOR', 'PARENT', 'SUBSIDIARY', 'BRANCH'].includes(String(aiResult.relationshipType || '').toUpperCase())) {
        return { ok: false, reason: 'definite_relationship_not_allowed' };
    }
    const blob = JSON.stringify(aiResult).toLowerCase();
    if (/\brevenue\b|\bturnover\b|\bemployees?\b|\binvented company\b/.test(blob)) {
        return { ok: false, reason: 'unsupported_claim' };
    }
    return { ok: true, result: aiResult };
}
