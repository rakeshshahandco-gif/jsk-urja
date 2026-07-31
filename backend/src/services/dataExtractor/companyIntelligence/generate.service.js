import { buildRuleBasedProfile } from './ruleSummary.service.js';
import { enrichProfileWithAi, validateAiProfileOutput, applyHybridWording } from './aiAdapter.js';
import { ENGINE_VERSION } from './constants.js';

export async function generateCompanyProfile({
    record = {},
    classification = null,
    relevance = null,
    recommendation = null,
    contact = null,
    mode = 'rule_based',
} = {}) {
    const ruleResult = buildRuleBasedProfile({
        record, classification, relevance, recommendation, contact, mode,
    });

    if (mode === 'manual_only') {
        return {
            ...ruleResult,
            status: 'MANUAL_REVIEW_REQUIRED',
            engineUsed: 'manual_only',
            modelVersion: ENGINE_VERSION,
        };
    }

    if (mode === 'rule_based') {
        return ruleResult;
    }

    const allowed = {
        companyName: ruleResult.companyName,
        industries: [ruleResult.primaryIndustry, ...(ruleResult.secondaryIndustries || [])].filter(Boolean),
        customerTypes: [ruleResult.customerType].filter(Boolean),
        productNames: [
            recommendation?.primaryRecommendation?.productName,
            ...(recommendation?.secondaryRecommendations || []).map((p) => p.productName),
            ...(recommendation?.alternativeProducts || []).map((p) => p.productName || p),
        ].filter(Boolean),
        contactKeys: [
            contact?.primaryContact?.contactKey,
            contact?.primaryContact?.email,
            contact?.primaryContact?.phone,
            ...(contact?.contacts || []).flatMap((c) => [c.contactKey, c.email, c.phone]),
        ].filter(Boolean),
    };

    const ai = await enrichProfileWithAi({ ruleResult, allowed });
    if (!ai.ok || !ai.result) {
        return {
            ...ruleResult,
            engineUsed: mode === 'hybrid' ? 'hybrid_fallback_rules' : 'ai_fallback_rules',
            fallbackUsed: true,
            fallbackReason: ai.reason || 'AI unavailable',
            modelVersion: ai.modelVersion || ENGINE_VERSION,
        };
    }

    const validated = validateAiProfileOutput(ai.result, allowed);
    if (!validated.ok) {
        return {
            ...ruleResult,
            engineUsed: mode === 'hybrid' ? 'hybrid_fallback_rules' : 'ai_fallback_rules',
            fallbackUsed: true,
            fallbackReason: validated.reason || 'AI validation failed',
            modelVersion: ai.modelVersion || ENGINE_VERSION,
        };
    }

    if (mode === 'hybrid') {
        return {
            ...applyHybridWording(ruleResult, validated.result),
            modelVersion: ai.modelVersion || ENGINE_VERSION,
        };
    }

    // Pure AI mode: still cannot invent facts — merge only validated wording onto rule facts
    return {
        ...applyHybridWording(ruleResult, validated.result),
        engineUsed: 'ai',
        modelVersion: ai.modelVersion || ENGINE_VERSION,
        fallbackUsed: false,
    };
}
