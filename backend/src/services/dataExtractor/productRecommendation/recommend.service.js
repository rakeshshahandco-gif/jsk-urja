import { recommendProducts, ENGINE_VERSION } from './matchingEngine.service.js';
import { enrichRecommendationsWithAi, validateAiRecommendationOutput } from './aiAdapter.js';

function defaultMode(settingsDoc = {}) {
    const mode = settingsDoc?.aiLeadIntelligence?.productRecommendation?.mode
        || settingsDoc?.aiLeadIntelligence?.classificationMode
        || 'rule_based';
    return ['rule_based', 'ai', 'hybrid', 'manual_review'].includes(mode) ? mode : 'rule_based';
}

export async function runProductRecommendation({
    record,
    classification,
    relevance,
    products,
    opportunityMaps,
    settingsDoc,
    searchContext,
    customerType,
    forceMode = null,
} = {}) {
    const mode = forceMode || defaultMode(settingsDoc);
    const ruleResult = recommendProducts({
        record,
        classification,
        relevance,
        products,
        opportunityMaps,
        settingsDoc,
        searchContext,
        customerType,
    });

    if (mode === 'manual_review') {
        return {
            ...ruleResult,
            status: 'MANUAL_REVIEW',
            engineUsed: 'manual_review',
            applied: false,
        };
    }

    if (mode === 'rule_based') {
        return { ...ruleResult, engineUsed: 'rule_based', fallbackUsed: false };
    }

    // ai or hybrid — attempt AI, always fall back to rules on failure
    const allowed = (products || []).map((p) => p.productName);
    let aiAttempt;
    try {
        aiAttempt = await enrichRecommendationsWithAi({
            record,
            classification,
            relevance,
            ruleResult,
            allowedProductNames: allowed,
        });
    } catch (err) {
        aiAttempt = { ok: false, fallback: true, reason: err?.message || 'ai_failed' };
    }

    if (!aiAttempt?.ok) {
        return {
            ...ruleResult,
            engineUsed: mode === 'hybrid' ? 'hybrid_rule_fallback' : 'ai_rule_fallback',
            fallbackUsed: true,
            modelProvider: aiAttempt?.modelProvider || '',
            modelVersion: aiAttempt?.modelVersion || ENGINE_VERSION,
            aiFallbackReason: aiAttempt?.reason || 'AI unavailable',
        };
    }

    const validated = validateAiRecommendationOutput(aiAttempt.result, allowed);
    if (!validated.ok) {
        return {
            ...ruleResult,
            engineUsed: mode === 'hybrid' ? 'hybrid_rule_fallback' : 'ai_rule_fallback',
            fallbackUsed: true,
            aiFallbackReason: validated.reason,
        };
    }

    return {
        ...ruleResult,
        ...validated.result,
        engineUsed: mode,
        fallbackUsed: false,
        modelProvider: aiAttempt.modelProvider || '',
        modelVersion: aiAttempt.modelVersion || ENGINE_VERSION,
    };
}
