import { ENGINE_VERSION, FORBIDDEN_CLAIM_PATTERNS, NEXT_ACTIONS } from './constants.js';

export function getConfiguredAiProvider() {
    const key = String(process.env.EXTRACTOR_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
    const model = String(process.env.EXTRACTOR_OPENAI_MODEL || 'gpt-4o-mini').trim();
    if (!key) return { available: false, provider: '', model: '', reason: 'AI key not configured' };
    return { available: true, provider: 'openai', model, reason: '' };
}

function blobHasForbiddenClaims(text = '') {
    const s = String(text || '');
    for (const re of FORBIDDEN_CLAIM_PATTERNS) {
        if (re.test(s)) return re.source;
    }
    return '';
}

/**
 * Soft-fail AI enrichment. Local/dev does not call live providers by default.
 * Callers must fall back to rule-based output.
 */
export async function enrichProfileWithAi({ ruleResult, allowed = {} }) {
    const cfg = getConfiguredAiProvider();
    if (!cfg.available) {
        return { ok: false, fallback: true, reason: cfg.reason, result: null };
    }
    void ruleResult;
    void allowed;
    return {
        ok: false,
        fallback: true,
        reason: 'AI enrichment unavailable; using rule engine',
        result: null,
        modelProvider: cfg.provider,
        modelVersion: cfg.model || ENGINE_VERSION,
    };
}

export function validateAiProfileOutput(aiResult, allowed = {}) {
    if (!aiResult || typeof aiResult !== 'object') return { ok: false, reason: 'malformed' };

    const shortSummary = String(aiResult.shortSummary || '');
    const standardSummary = String(aiResult.standardSummary || '');
    if (shortSummary.length > 600) return { ok: false, reason: 'short_summary_too_long' };
    if (standardSummary.length > 2500) return { ok: false, reason: 'standard_summary_too_long' };

    const forbidden = blobHasForbiddenClaims(JSON.stringify(aiResult));
    if (forbidden) return { ok: false, reason: `unsupported_claim:${forbidden}` };

    if (aiResult.companyName && allowed.companyName
        && String(aiResult.companyName).toLowerCase() !== String(allowed.companyName).toLowerCase()) {
        return { ok: false, reason: 'company_name_mismatch' };
    }

    if (aiResult.primaryIndustry && Array.isArray(allowed.industries) && allowed.industries.length) {
        const ok = allowed.industries.map((x) => String(x).toLowerCase()).includes(String(aiResult.primaryIndustry).toLowerCase());
        if (!ok) return { ok: false, reason: 'industry_not_allowed' };
    }

    if (aiResult.customerType && Array.isArray(allowed.customerTypes) && allowed.customerTypes.length) {
        const ok = allowed.customerTypes.map((x) => String(x).toLowerCase()).includes(String(aiResult.customerType).toLowerCase());
        if (!ok) return { ok: false, reason: 'customer_type_not_allowed' };
    }

    if (aiResult.recommendedProduct && Array.isArray(allowed.productNames) && allowed.productNames.length) {
        const ok = allowed.productNames.map((x) => String(x).toLowerCase()).includes(String(aiResult.recommendedProduct).toLowerCase());
        if (!ok) return { ok: false, reason: 'product_not_allowed' };
    }

    if (aiResult.recommendedNextAction && !NEXT_ACTIONS.includes(aiResult.recommendedNextAction)) {
        return { ok: false, reason: 'next_action_not_allowed' };
    }

    if (aiResult.confidence != null && (aiResult.confidence < 0 || aiResult.confidence > 100)) {
        return { ok: false, reason: 'confidence_out_of_range' };
    }

    // Contacts cannot be invented: any contact name/email/phone must already exist in allowed contacts
    const inventedContact = aiResult.primaryPublicContact || aiResult.inventedContact;
    if (inventedContact && typeof inventedContact === 'object') {
        const allowedContacts = allowed.contactKeys || [];
        const key = inventedContact.contactKey || inventedContact.email || inventedContact.phone || inventedContact.contactName;
        if (key && allowedContacts.length && !allowedContacts.map((x) => String(x).toLowerCase()).includes(String(key).toLowerCase())) {
            return { ok: false, reason: 'contact_not_allowed' };
        }
    }

    return { ok: true, result: aiResult };
}

/** Apply AI wording improvements only onto fields that do not introduce new facts. */
export function applyHybridWording(ruleResult, aiResult) {
    if (!aiResult || typeof aiResult !== 'object') return { ...ruleResult, fallbackUsed: true, fallbackReason: 'hybrid_no_ai' };
    const next = { ...ruleResult };
    if (aiResult.shortSummary && !blobHasForbiddenClaims(aiResult.shortSummary)) {
        // Keep factual anchors from rule summary; only replace if AI stays within length and does not add forbidden claims
        if (String(aiResult.shortSummary).includes(ruleResult.companyName)) {
            next.shortSummary = String(aiResult.shortSummary).slice(0, 480);
        }
    }
    if (aiResult.standardSummary && !blobHasForbiddenClaims(aiResult.standardSummary)
        && String(aiResult.standardSummary).includes(ruleResult.companyName)) {
        next.standardSummary = String(aiResult.standardSummary).slice(0, 2500);
    }
    next.engineUsed = 'hybrid';
    next.fallbackUsed = false;
    return next;
}
