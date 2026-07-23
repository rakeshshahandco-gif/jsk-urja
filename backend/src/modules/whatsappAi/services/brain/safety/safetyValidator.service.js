/**
 * Phase 1C.5 — Safety validator for draft / prompt content.
 */

import {
    SAFETY_ENGINE_VERSION,
    COMMERCIAL_PATTERNS,
    CONFIDENTIAL_PATTERNS,
    INJECTION_PATTERNS,
    UNSAFE_CONTENT_PATTERNS,
} from './safetyPatterns.js';

function matchAll(text, patterns) {
    const hits = [];
    const s = String(text || '');
    for (const p of patterns) {
        if (p.re.test(s)) hits.push({ id: p.id, risk: p.risk || 'medium' });
    }
    return hits;
}

/**
 * @param {{
 *   draftText?: string,
 *   customerMessage?: string,
 *   groundingPack?: object,
 *   productIntelligence?: object,
 * }} input
 */
export function validateSafety(input = {}) {
    const draft = String(input.draftText || '');
    const customer = String(input.customerMessage || '');
    const combined = draft + '\n' + customer;

    const warnings = [];
    const commercialHits = matchAll(draft, COMMERCIAL_PATTERNS);
    const confidentialHits = matchAll(combined, CONFIDENTIAL_PATTERNS);
    const injectionHits = matchAll(customer, INJECTION_PATTERNS);
    const unsafeHits = matchAll(draft, UNSAFE_CONTENT_PATTERNS);

    for (const h of commercialHits) warnings.push('commercial:' + h.id);
    for (const h of confidentialHits) warnings.push('confidential:' + h.id);
    for (const h of injectionHits) warnings.push('injection:' + h.id);
    for (const h of unsafeHits) warnings.push('unsafe:' + h.id);

    // Unsupported specs: draft asserts concrete electrical numbers not present in grounding
    const groundingText = (input.groundingPack?.sources || [])
        .map((s) => String(s.contentSnippet || s.title || ''))
        .join(' ');
    const specClaim = /\b(\d+)\s*W\b|\bDT[68]\b|\b\d+\s*V\b/i.exec(draft);
    if (specClaim && groundingText && !groundingText.toLowerCase().includes(specClaim[0].toLowerCase())) {
        // only flag when grounding exists but claim not covered
        if (!new RegExp(specClaim[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(groundingText)) {
            warnings.push('unsupported_specification');
        }
    }

    const emptyGrounding = !!(input.groundingPack?.emptyGrounding) || !(input.groundingPack?.sources || []).length;
    const groundingCoverage = emptyGrounding ? 0 : Math.min(1, (input.groundingPack.sources.length || 0) / 3);

    const injectionDetected = injectionHits.length > 0;
    const critical = confidentialHits.some((h) => h.risk === 'critical') || unsafeHits.some((h) => h.id === 'script_content');
    const highCommercial = commercialHits.some((h) => h.risk === 'high');

    let action = 'allow';
    let confidence = 0.85;
    let requiresHumanReview = true; // Phase 1 always human review
    let commercialRisk = commercialHits.length ? (highCommercial ? 'high' : 'medium') : 'low';

    if (critical || injectionDetected) {
        action = 'block';
        confidence = 0.95;
    } else if (highCommercial || confidentialHits.length || warnings.includes('unsupported_specification')) {
        action = 'rewrite_safe';
        confidence = 0.8;
    } else if (emptyGrounding && draft.length > 40) {
        action = 'rewrite_safe';
        warnings.push('ungrounded_draft');
        confidence = 0.7;
    }

    return {
        version: SAFETY_ENGINE_VERSION,
        action, // allow | rewrite_safe | block
        confidence,
        warnings,
        requiresHumanReview,
        groundingCoverage,
        commercialRisk,
        injectionDetected,
        meta: {
            commercialHits: commercialHits.map((h) => h.id),
            confidentialHits: confidentialHits.map((h) => h.id),
            injectionHits: injectionHits.map((h) => h.id),
            unsafeHits: unsafeHits.map((h) => h.id),
        },
    };
}

export function rewriteSafeDraft(draftText, safetyResult) {
    if (!safetyResult || safetyResult.action === 'allow') return String(draftText || '');
    if (safetyResult.action === 'block') {
        return 'Thank you for your message. Our team will review this and respond shortly. (safe fallback — dry-run draft, not sent)';
    }
    // rewrite_safe: strip hard commercial claims heuristically
    let text = String(draftText || '');
    text = text.replace(/\b(price\s+is|costs?\s+only)\s*[^\n.]*/gi, 'pricing will be shared by our team after review');
    text = text.replace(/\b(in\s+stock|available\s+now)[^\n.]*/gi, 'stock availability will be confirmed by our team');
    text = text.replace(/\b(deliver(y|ed)?\s+(by|within|tomorrow)|dispatch\s+(today|tomorrow))[^\n.]*/gi, 'delivery timelines will be confirmed by our team');
    if (!text.trim()) {
        text = 'Thank you for your enquiry. Our team will follow up with accurate details shortly. (safe rewrite — dry-run draft, not sent)';
    }
    return text;
}

export function createSafetyValidator() {
    return {
        version: SAFETY_ENGINE_VERSION,
        validate: validateSafety,
        rewriteSafe: rewriteSafeDraft,
    };
}

export default createSafetyValidator;
