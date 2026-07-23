/**
 * Phase 1C.5 — Cost / budget control layer (in-memory, company-isolated).
 * No provider calls when budget exceeded.
 */

import { BUDGET_ENGINE_VERSION, DEFAULT_BUDGET_LIMITS } from './budgetDefaults.js';
import { estimateTokensRough } from '../providers/AiProvider.interface.js';

function dayKey(d = new Date()) {
    return d.toISOString().slice(0, 10);
}
function monthKey(d = new Date()) {
    return d.toISOString().slice(0, 7);
}

/**
 * @param {{ limits?: object, store?: Map }} [options]
 */
export function createBudgetEngine(options = {}) {
    const limits = { ...DEFAULT_BUDGET_LIMITS, ...(options.limits || {}) };
    /** @type {Map<string, object>} */
    const store = options.store || new Map();

    function companyBucket(companyId) {
        const id = companyId == null ? '_none' : String(companyId);
        if (!store.has(id)) {
            store.set(id, {
                companyId: id,
                day: dayKey(),
                month: monthKey(),
                dailyRequests: 0,
                monthlyRequests: 0,
                dailyTokens: 0,
                monthlyTokens: 0,
                estimatedCostUsd: 0,
                actualCostUsd: 0,
                byProvider: {},
            });
        }
        const b = store.get(id);
        const dk = dayKey();
        const mk = monthKey();
        if (b.day !== dk) {
            b.day = dk;
            b.dailyRequests = 0;
            b.dailyTokens = 0;
        }
        if (b.month !== mk) {
            b.month = mk;
            b.monthlyRequests = 0;
            b.monthlyTokens = 0;
        }
        return b;
    }

    function check(companyId, estimate = {}) {
        const b = companyBucket(companyId);
        const tokens = Number(estimate.tokens) || 0;
        const warnings = [];
        let allowed = true;
        let hardStopped = false;

        if (tokens > limits.perMessageTokenLimit) {
            allowed = false;
            warnings.push('per_message_token_limit');
        }
        if (b.dailyRequests + 1 > limits.dailyRequestLimit) {
            allowed = false;
            warnings.push('daily_request_limit');
        }
        if (b.monthlyRequests + 1 > limits.monthlyRequestLimit) {
            allowed = false;
            warnings.push('monthly_request_limit');
        }
        if (b.dailyTokens + tokens > limits.dailyTokenLimit) {
            allowed = false;
            warnings.push('daily_token_limit');
        }
        if (b.monthlyTokens + tokens > limits.monthlyTokenLimit) {
            allowed = false;
            warnings.push('monthly_token_limit');
        }
        if (!allowed && limits.hardStop) hardStopped = true;

        return {
            version: BUDGET_ENGINE_VERSION,
            allowed,
            hardStopped,
            warnings,
            estimatedCostUsd: Number(estimate.estimatedUsd) || 0,
            usage: {
                dailyRequests: b.dailyRequests,
                monthlyRequests: b.monthlyRequests,
                dailyTokens: b.dailyTokens,
                monthlyTokens: b.monthlyTokens,
                estimatedCostUsd: b.estimatedCostUsd,
                actualCostUsd: b.actualCostUsd,
                byProvider: { ...b.byProvider },
            },
            limits: { ...limits },
            companyId: b.companyId,
        };
    }

    function record(companyId, usage = {}) {
        const b = companyBucket(companyId);
        const tokens = Number(usage.tokens) || 0;
        const estimatedUsd = Number(usage.estimatedUsd) || 0;
        const actualUsd = Number(usage.actualUsd) || 0;
        const providerId = usage.providerId || 'null';
        const model = usage.model || null;
        b.dailyRequests += 1;
        b.monthlyRequests += 1;
        b.dailyTokens += tokens;
        b.monthlyTokens += tokens;
        b.estimatedCostUsd += estimatedUsd;
        b.actualCostUsd += actualUsd;
        if (!b.byProvider[providerId]) {
            b.byProvider[providerId] = { requests: 0, tokens: 0, estimatedUsd: 0, actualUsd: 0, models: {} };
        }
        b.byProvider[providerId].requests += 1;
        b.byProvider[providerId].tokens += tokens;
        b.byProvider[providerId].estimatedUsd += estimatedUsd;
        b.byProvider[providerId].actualUsd += actualUsd;
        if (model) {
            b.byProvider[providerId].models[model] = (b.byProvider[providerId].models[model] || 0) + 1;
        }
        return check(companyId, { tokens: 0 });
    }

    function estimateFromPrompts(systemPrompt, userPrompt, costHint = {}) {
        const tokens = estimateTokensRough(String(systemPrompt || '') + String(userPrompt || ''));
        return {
            tokens,
            estimatedUsd: Number(costHint.estimatedUsd) || 0,
        };
    }

    function safeAcknowledgement() {
        return 'Thank you for your message. We have received it and our team will respond shortly. (budget-safe acknowledgement — dry-run, not sent)';
    }

    return {
        version: BUDGET_ENGINE_VERSION,
        check,
        record,
        estimateFromPrompts,
        safeAcknowledgement,
        getUsage(companyId) {
            return { ...companyBucket(companyId) };
        },
        getLimits() {
            return { ...limits };
        },
    };
}

export default createBudgetEngine;
