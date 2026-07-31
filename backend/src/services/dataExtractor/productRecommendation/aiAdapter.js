/**
 * Isolated AI adapter for product recommendations.
 * Never logs secrets. Soft-fails so rule engine can take over.
 */
import { ENGINE_VERSION } from './constants.js';

export function getConfiguredAiProvider() {
    const key = String(process.env.EXTRACTOR_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
    const model = String(process.env.EXTRACTOR_OPENAI_MODEL || 'gpt-4o-mini').trim();
    if (!key) return { available: false, provider: '', model: '', reason: 'AI key not configured' };
    return { available: true, provider: 'openai', model, reason: '' };
}

export async function enrichRecommendationsWithAi({ record, classification, relevance, ruleResult, allowedProductNames = [] }) {
    const cfg = getConfiguredAiProvider();
    if (!cfg.available) {
        return { ok: false, fallback: true, reason: cfg.reason, result: null };
    }

    // Intentionally no live network call in local/dev without explicit provider path.
    // Soft-fail so hybrid/ai modes always fall back to rules without stopping batches.
    void record;
    void classification;
    void relevance;
    void ruleResult;
    void allowedProductNames;
    return {
        ok: false,
        fallback: true,
        reason: 'AI enrichment unavailable; using rule engine',
        result: null,
        modelProvider: cfg.provider,
        modelVersion: cfg.model || ENGINE_VERSION,
    };
}

export function validateAiRecommendationOutput(aiResult, allowedProductNames = []) {
    if (!aiResult || typeof aiResult !== 'object') return { ok: false, reason: 'malformed' };
    const name = aiResult.primaryRecommendation?.productName;
    if (name && !allowedProductNames.map((x) => String(x).toLowerCase()).includes(String(name).toLowerCase())) {
        return { ok: false, reason: 'product_not_in_master' };
    }
    if (aiResult.confidence != null && (aiResult.confidence < 0 || aiResult.confidence > 100)) {
        return { ok: false, reason: 'confidence_out_of_range' };
    }
    return { ok: true, result: aiResult };
}
