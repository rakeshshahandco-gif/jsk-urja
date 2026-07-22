/**
 * Phase 1C.0 — Null Provider.
 * Always returns a deterministic dummy response. No network, no SDK, no keys.
 */

import { assertCompletionRequest } from '../AiProvider.interface.js';

export const NULL_PROVIDER_ID = 'null';
export const NULL_PROVIDER_MODEL = 'null-deterministic-v1';
export const NULL_PROVIDER_DUMMY_TEXT = Object.freeze(
    '[WHATSAPP_AI_NULL_PROVIDER] Deterministic dry-run reply. No AI provider was called. No message was sent to WhatsApp.',
);

/** @returns {{ id: string, complete: Function }} */
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
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                raw: {
                    note: 'null_provider_stub',
                    systemPromptLength: req.systemPrompt.length,
                    userPromptLength: req.userPrompt.length,
                },
            };
        },
    };
}

export default createNullProvider;
