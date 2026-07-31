import { ENGINE_VERSION } from './constants.js';

export function getConfiguredAiProvider() {
    const key = String(process.env.EXTRACTOR_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
    const model = String(process.env.EXTRACTOR_OPENAI_MODEL || 'gpt-4o-mini').trim();
    if (!key) return { available: false, provider: '', model: '', reason: 'AI key not configured' };
    return { available: true, provider: 'openai', model, reason: '' };
}

export async function suggestScoreAdjustment({ ruleResult, settings }) {
    const cfg = getConfiguredAiProvider();
    if (!cfg.available) {
        return { ok: false, fallback: true, reason: cfg.reason, adjustment: null };
    }
    void ruleResult;
    void settings;
    return {
        ok: false,
        fallback: true,
        reason: 'AI enrichment unavailable; using rule engine',
        adjustment: null,
        modelProvider: cfg.provider,
        modelVersion: cfg.model || ENGINE_VERSION,
    };
}

export function validateAiAdjustment(adjustment, settings = {}, ruleResult = {}) {
    if (!adjustment || typeof adjustment !== 'object') return { ok: false, reason: 'malformed' };
    const maxAdj = Math.max(0, Number(settings.maxAiAdjustment ?? 5) || 5);
    const delta = Number(adjustment.delta);
    if (!Number.isFinite(delta)) return { ok: false, reason: 'delta_not_numeric' };
    if (Math.abs(delta) > maxAdj) return { ok: false, reason: 'delta_exceeds_limit' };
    if (!String(adjustment.explanation || '').trim()) return { ok: false, reason: 'explanation_required' };
    if (!Array.isArray(adjustment.evidenceReferences) || !adjustment.evidenceReferences.length) {
        return { ok: false, reason: 'evidence_required' };
    }
    // Reject unsupported invented evidence
    const blob = JSON.stringify(adjustment).toLowerCase();
    if (/\brevenue\b|\bturnover\b|\bemployees?\b|\biso\s*\d|\bgstin\b/.test(blob)) {
        return { ok: false, reason: 'unsupported_evidence' };
    }
    const next = Math.max(0, Math.min(100, Number(ruleResult.finalScore || 0) + delta));
    if (next < 0 || next > 100) return { ok: false, reason: 'score_out_of_range' };
    return { ok: true, delta, nextScore: next, adjustment };
}

export function applyAiAdjustment(ruleResult, adjustment, settings) {
    const validated = validateAiAdjustment(adjustment, settings, ruleResult);
    if (!validated.ok) {
        return {
            ...ruleResult,
            fallbackUsed: true,
            fallbackReason: validated.reason,
            engineUsed: 'ai_fallback_rules',
        };
    }
    return {
        ...ruleResult,
        preAiScore: ruleResult.finalScore,
        postAiScore: validated.nextScore,
        finalScore: validated.nextScore,
        aiAdjustment: {
            delta: validated.delta,
            explanation: adjustment.explanation,
            evidenceReferences: adjustment.evidenceReferences,
        },
        engineUsed: 'hybrid',
        fallbackUsed: false,
        recommendationReason: `${ruleResult.recommendationReason} | AI delta ${validated.delta > 0 ? '+' : ''}${validated.delta}: ${adjustment.explanation}`,
    };
}
