/**
 * Phase 1C.4 — Gemini adapter (HTTPS/fetch; no vendor SDK).
 * Real network calls DISABLED by default (callsEnabled: false).
 */

import { assertCompletionRequest, estimateTokensRough } from '../AiProvider.interface.js';
import { createHttpTransport } from '../httpTransport.js';
import { createNullProvider } from './null.adapter.js';
import { maskSecret } from '../providerSecrets.js';

export const GEMINI_PROVIDER_ID = 'gemini';
export const GEMINI_DEFAULT_MODEL = 'gemini-2.0-flash';

/**
 * @param {
 *   callsEnabled?: boolean,
 *   apiKey?: string|null,
 *   model?: string,
 *   transport?: object,
 *   timeoutMs?: number,
 * } [options]
 */
export function createGeminiProvider(options = {}) {
    const callsEnabled = options.callsEnabled === true;
    const model = options.model || GEMINI_DEFAULT_MODEL;
    const transport = options.transport || createHttpTransport({ timeoutMs: options.timeoutMs });
    const nullFallback = createNullProvider();
    const apiKey = options.apiKey || null;

    function keyPresent() {
        return !!(apiKey && String(apiKey).length > 0);
    }

    return {
        id: GEMINI_PROVIDER_ID,
        async complete(req) {
            assertCompletionRequest(req);
            if (!callsEnabled || !keyPresent()) {
                const fallback = await nullFallback.complete(req);
                return {
                    ...fallback,
                    providerId: GEMINI_PROVIDER_ID,
                    model,
                    deterministic: true,
                    networkCalled: false,
                    raw: {
                        ...(fallback.raw || {}),
                        note: 'provider_inactive_or_missing_key',
                        requestedProvider: GEMINI_PROVIDER_ID,
                        callsEnabled,
                        keyConfigured: keyPresent(),
                        keyStatus: maskSecret(apiKey).masked,
                        endpointNote: 'https://generativelanguage.googleapis.com',
                        transportReady: !!transport,
                    },
                };
            }
            const err = new Error('Gemini live calls are not activated in Phase 1C.4 defaults');
            err.code = 'WHATSAPP_AI_PROVIDER_CALLS_BLOCKED';
            throw err;
        },
        async healthCheck() {
            return {
                ok: true,
                providerId: GEMINI_PROVIDER_ID,
                networkCalled: false,
                callsEnabled,
                keyConfigured: keyPresent(),
                keyStatus: maskSecret(apiKey).masked,
                detail: callsEnabled && keyPresent() ? 'configured_inactive_until_owner_approval' : 'disabled_or_unconfigured',
            };
        },
        estimateCost(req = {}) {
            const tokens = estimateTokensRough((req.systemPrompt || '') + (req.userPrompt || ''));
            const usdPer1k = 0.0015;
            return {
                currency: 'USD',
                estimatedUsd: Number(((tokens / 1000) * usdPer1k).toFixed(6)),
                providerId: GEMINI_PROVIDER_ID,
                model,
                tokens,
            };
        },
        normalizeError(err) {
            return {
                code: err?.code || 'GEMINI_ERROR',
                message: String(err?.message || err || 'unknown'),
                providerId: GEMINI_PROVIDER_ID,
                retryable: false,
            };
        },
        supportsStructuredOutput() {
            return true;
        },
    };
}

export default createGeminiProvider;
