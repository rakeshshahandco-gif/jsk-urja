/**
 * Phase 1C.4 — Local LLM adapter (OpenAI-compatible HTTP).
 * Real network calls DISABLED by default.
 */

import { assertCompletionRequest, estimateTokensRough } from '../AiProvider.interface.js';
import { createHttpTransport } from '../httpTransport.js';
import { createNullProvider } from './null.adapter.js';

export const LOCAL_PROVIDER_ID = 'local';
export const LOCAL_DEFAULT_MODEL = 'local-llm';

export function createLocalLlmProvider(options = {}) {
    const callsEnabled = options.callsEnabled === true;
    const model = options.model || LOCAL_DEFAULT_MODEL;
    const baseUrl = options.baseUrl || 'http://127.0.0.1:11434';
    const transport = options.transport || createHttpTransport({ timeoutMs: options.timeoutMs });
    const nullFallback = createNullProvider();

    return {
        id: LOCAL_PROVIDER_ID,
        async complete(req) {
            assertCompletionRequest(req);
            if (!callsEnabled) {
                const fallback = await nullFallback.complete(req);
                return {
                    ...fallback,
                    providerId: LOCAL_PROVIDER_ID,
                    model,
                    networkCalled: false,
                    raw: {
                        ...(fallback.raw || {}),
                        note: 'local_llm_inactive',
                        baseUrl,
                        callsEnabled: false,
                        transportReady: !!transport,
                    },
                };
            }
            const err = new Error('Local LLM live calls are not activated in Phase 1C.4 defaults');
            err.code = 'WHATSAPP_AI_PROVIDER_CALLS_BLOCKED';
            throw err;
        },
        async healthCheck() {
            return {
                ok: true,
                providerId: LOCAL_PROVIDER_ID,
                networkCalled: false,
                callsEnabled,
                baseUrl,
                detail: callsEnabled ? 'configured_inactive_until_owner_approval' : 'disabled',
            };
        },
        estimateCost(req = {}) {
            return {
                currency: 'USD',
                estimatedUsd: 0,
                providerId: LOCAL_PROVIDER_ID,
                model,
                tokens: estimateTokensRough((req.systemPrompt || '') + (req.userPrompt || '')),
            };
        },
        normalizeError(err) {
            return {
                code: err?.code || 'LOCAL_LLM_ERROR',
                message: String(err?.message || err || 'unknown'),
                providerId: LOCAL_PROVIDER_ID,
                retryable: false,
            };
        },
        supportsStructuredOutput() {
            return false;
        },
    };
}

export default createLocalLlmProvider;
