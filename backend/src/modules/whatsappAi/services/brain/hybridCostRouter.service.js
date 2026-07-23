/**
 * Phase 1C.5 — Hybrid cost router.
 * Greeting → rule (no AI cost)
 * Simple approved FAQ → knowledge (no AI cost)
 * Complex → provider only when enabled + budget allows
 * Budget exceeded → safe acknowledgement, no provider call
 */

import { routeHybrid } from './hybridRouter.service.js';

export const HYBRID_COST_ROUTER_VERSION = 'hybrid_cost_router_v1';

/**
 * @param {object} input
 */
export function routeWithCostControls(input = {}) {
    const base = routeHybrid(input);
    const groundingPack = input.groundingPack || null;
    const hasFaqHit = !!(groundingPack && !groundingPack.emptyGrounding && (groundingPack.sources || []).length);
    const simpleFaqIntent = ['product_enquiry', 'unknown'].includes(String(input.intent || ''))
        && Number(input.confidence || 0) >= 0.55
        && hasFaqHit
        && String(input.text || '').length < 280;

    let path = base.path;
    let callProvider = base.callProvider;
    let reason = base.reason;

    if (simpleFaqIntent && path === 'llm') {
        path = 'faq';
        callProvider = false;
        reason = 'Simple approved FAQ / knowledge response — no AI provider cost.';
    }

    if (path === 'rule') {
        return {
            version: HYBRID_COST_ROUTER_VERSION,
            path: 'rule',
            reason,
            callProvider: false,
            aiCost: false,
            fallback: null,
        };
    }

    if (path === 'faq') {
        return {
            version: HYBRID_COST_ROUTER_VERSION,
            path: 'faq',
            reason,
            callProvider: false,
            aiCost: false,
            fallback: null,
        };
    }

    if (input.budgetAllowed === false) {
        return {
            version: HYBRID_COST_ROUTER_VERSION,
            path: 'budget_safe',
            reason: 'Budget exceeded — safe acknowledgement, no provider call.',
            callProvider: false,
            aiCost: false,
            fallback: 'budget_exceeded',
        };
    }

    if (input.providerEnabled !== true || input.providerAvailable === false) {
        return {
            version: HYBRID_COST_ROUTER_VERSION,
            path: 'llm',
            reason: 'Provider disabled or unavailable — Null Provider / safe fallback.',
            callProvider: true,
            aiCost: false,
            fallback: 'null_provider',
            useNullProvider: true,
        };
    }

    return {
        version: HYBRID_COST_ROUTER_VERSION,
        path: 'llm',
        reason: reason || 'Complex enquiry routed to provider when enabled.',
        callProvider: true,
        aiCost: true,
        fallback: null,
        useNullProvider: false,
    };
}

export function createHybridCostRouter() {
    return { route: routeWithCostControls, version: HYBRID_COST_ROUTER_VERSION };
}

export default createHybridCostRouter;
