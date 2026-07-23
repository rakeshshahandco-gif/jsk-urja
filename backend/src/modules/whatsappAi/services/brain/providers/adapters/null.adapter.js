/**
 * Phase 1C.4 — Null Provider (full interface).
 * Deterministic dummy response. No network, no SDK, no keys.
 */

import { assertCompletionRequest, estimateTokensRough } from '../AiProvider.interface.js';

export const NULL_PROVIDER_ID = 'null';
export const NULL_PROVIDER_MODEL = 'null-deterministic-v1';
export const NULL_PROVIDER_DUMMY_TEXT = Object.freeze(
    '[WHATSAPP_AI_NULL_PROVIDER] Deterministic dry-run reply. No AI provider was called. No message was sent to WhatsApp.',
);

/** @returns {import('../AiProvider.interface.js').AiProvider} */
export function createNullProvider() {
    return {
        id: NULL_PROVIDER_ID,
        async complete(req) {
            assertCompletionRequest(req);
            return {
                text: NULL_PROVIDER_DUMMY_TEXT,
                providerId: NULL_PROVIDER_ID,
                model: NULL_PROVIDER_MODEL,
                deterministic: true,
                networkCalled: false,
                usage: {
                    promptTokens: estimateTokensRough(req.systemPrompt + req.userPrompt),
                    completionTokens: estimateTokensRough(NULL_PROVIDER_DUMMY_TEXT),
                    totalTokens: estimateTokensRough(req.systemPrompt + req.userPrompt + NULL_PROVIDER_DUMMY_TEXT),
                },
                raw: {
                    note: 'null_provider_stub',
                    systemPromptLength: req.systemPrompt.length,
                    userPromptLength: req.userPrompt.length,
                },
            };
        },
        async healthCheck() {
            return { ok: true, providerId: NULL_PROVIDER_ID, networkCalled: false, detail: 'null_always_healthy' };
        },
        estimateCost(req = {}) {
            return { currency: 'USD', estimatedUsd: 0, providerId: NULL_PROVIDER_ID, model: NULL_PROVIDER_MODEL, tokens: estimateTokensRough((req.systemPrompt || '') + (req.userPrompt || '')) };
        },
        normalizeError(err) {
            return {
                code: err?.code || 'NULL_PROVIDER_ERROR',
                message: String(err?.message || err || 'unknown'),
                providerId: NULL_PROVIDER_ID,
                retryable: false,
            };
        },
        supportsStructuredOutput() {
            return false;
        },
    };
}

export default createNullProvider;
