import { scoreLeadRecord } from './scoringEngine.service.js';
import { suggestScoreAdjustment, applyAiAdjustment, validateAiAdjustment } from './aiAdapter.js';
import { normalizeScoringSettings } from './settings.service.js';
import { ENGINE_VERSION } from './constants.js';

export async function runLeadScoring({
    record = {},
    classification = null,
    relevance = null,
    recommendation = null,
    contact = null,
    profile = null,
    settings = null,
    searchContext = null,
    mode = null,
} = {}) {
    const cfg = normalizeScoringSettings(settings || {});
    const forceMode = mode || cfg.scoringMode || 'rule_based';
    const ruleResult = scoreLeadRecord({
        record, classification, relevance, recommendation, contact, profile, settings: cfg, searchContext,
    });

    if (forceMode === 'manual_review') {
        return {
            ...ruleResult,
            status: 'MANUAL_REVIEW_REQUIRED',
            priority: 'MANUAL_REVIEW_REQUIRED',
            engineUsed: 'manual_review',
            modelVersion: ENGINE_VERSION,
        };
    }

    if (forceMode === 'rule_based') {
        return ruleResult;
    }

    const ai = await suggestScoreAdjustment({ ruleResult, settings: cfg });
    if (!ai.ok || !ai.adjustment) {
        return {
            ...ruleResult,
            engineUsed: forceMode === 'hybrid' ? 'hybrid_fallback_rules' : 'ai_fallback_rules',
            fallbackUsed: true,
            fallbackReason: ai.reason || 'AI unavailable',
            modelVersion: ai.modelVersion || ENGINE_VERSION,
        };
    }

    const validated = validateAiAdjustment(ai.adjustment, cfg, ruleResult);
    if (!validated.ok) {
        return {
            ...ruleResult,
            engineUsed: forceMode === 'hybrid' ? 'hybrid_fallback_rules' : 'ai_fallback_rules',
            fallbackUsed: true,
            fallbackReason: validated.reason,
            modelVersion: ai.modelVersion || ENGINE_VERSION,
        };
    }

    return {
        ...applyAiAdjustment(ruleResult, ai.adjustment, cfg),
        modelVersion: ai.modelVersion || ENGINE_VERSION,
    };
}
