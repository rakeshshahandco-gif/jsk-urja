import { CONFIDENCE_WEIGHTS } from './constants.js';

/**
 * Score a relationship from evidence contributions.
 * Never invents confidence — only aggregates provided evidence weights.
 */
export function scoreRelationship({ relationshipType, evidence = [] } = {}) {
    const base = CONFIDENCE_WEIGHTS[relationshipType] ?? 40;
    if (!evidence.length) {
        return {
            confidence: Math.min(100, base),
            method: 'type_default',
            note: 'Confidence from relationship-type weight only; add evidence for stronger trust.',
        };
    }
    const contributions = evidence.map((e) => Number(e.confidenceContribution ?? e.weight ?? 0) || 0);
    const sum = contributions.reduce((a, b) => a + b, 0);
    const avg = sum / contributions.length;
    // Blend type weight with evidence average; cap at 99 for non-manual discoveries
    const blended = Math.round((base * 0.35) + (avg * 0.65));
    return {
        confidence: Math.max(1, Math.min(99, blended)),
        method: 'evidence_blend',
        contributions,
        note: 'Every relationship remains explainable via evidence list.',
    };
}

export function buildExplanation({ relationshipType, reason, evidence = [], confidence, source, discoveryMethod, freshness, limitations = [] }) {
    const why = reason
        || (evidence[0]?.reason)
        || `Observed ${relationshipType} signal from ${discoveryMethod || 'Rules Engine'}`;
    return {
        why,
        evidence: evidence.map((e) => ({
            field: e.field || '',
            displayValue: e.displayValue || '',
            sourceModule: e.sourceModule || '',
            reason: e.reason || '',
            confidenceContribution: e.confidenceContribution ?? null,
            freshness: e.freshness || 'CURRENT',
        })),
        confidence,
        source: source || discoveryMethod || 'Rules Engine',
        discoveryMethod: discoveryMethod || 'Rules Engine',
        lastUpdated: new Date().toISOString(),
        currentStatus: freshness || 'CURRENT',
        manualOverride: false,
        limitations: [
            ...limitations,
            'Relationships are never invented without evidence.',
            'Graph does not mutate CRM records.',
        ],
    };
}
