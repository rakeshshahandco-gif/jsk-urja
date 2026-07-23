/**
 * Phase 1C.0 — Hybrid Router.
 * Decides rule | faq | llm path. Cost optimisation foundation (no paid LLM yet).
 */

const RULE_INTENTS = new Set(['general_greeting']);
const FAQ_INTENTS = new Set([]); // reserved — FAQ matcher lands in later 1C slice
const LLM_INTENTS = new Set([
    'product_enquiry',
    'quotation_request',
    'technical_support',
    'complaint',
    'warranty',
    'sample_request',
    'dealer_enquiry',
    'distributor_enquiry',
    'price_enquiry',
    'availability_enquiry',
    'order_status',
    'unknown',
]);

/**
 * @param {{ intent: string, confidence?: number, entities?: object, text?: string }} input
 * @returns {{ path: 'rule'|'faq'|'llm', reason: string, callProvider: boolean }}
 */
export function routeHybrid(input = {}) {
    const intent = String(input.intent || 'unknown');
    const confidence = Number(input.confidence);
    const conf = Number.isFinite(confidence) ? confidence : 0;

    if (RULE_INTENTS.has(intent) && conf >= 0.8) {
        return {
            path: 'rule',
            reason: 'Simple greeting handled by rule engine — no AI provider call.',
            callProvider: false,
        };
    }

    // Phase 1C.0: FAQ path reserved (no KB match yet). Keep structure only.
    if (FAQ_INTENTS.has(intent)) {
        return {
            path: 'faq',
            reason: 'FAQ path reserved for approved knowledge matches.',
            callProvider: false,
        };
    }

    if (LLM_INTENTS.has(intent) || intent === 'unknown') {
        return {
            path: 'llm',
            reason: 'Complex or unknown intent routed to provider adapter (NullProvider in 1C.0).',
            callProvider: true,
        };
    }

    return {
        path: 'llm',
        reason: 'Default route to provider adapter.',
        callProvider: true,
    };
}

/** @returns {{ route: Function }} */
export function createHybridRouter() {
    return { route: routeHybrid };
}

export default createHybridRouter;
