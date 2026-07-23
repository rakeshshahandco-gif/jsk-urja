/**
 * Phase 1C.4 — Claude adapter (HTTPS/fetch; no vendor SDK).
 * Real network calls DISABLED by default (callsEnabled: false).
 */

import { assertCompletionRequest, estimateTokensRough } from '../AiProvider.interface.js';
import { createHttpTransport } from '../httpTransport.js';
import { createNullProvider } from './null.adapter.js';
import { maskSecret } from '../providerSecrets.js';

export const CLAUDE_PROVIDER_ID = 'claude';
export const CLAUDE_DEFAULT_MODEL = 'claude-3-5-haiku-latest';

/**
 * @param {
 *   callsEnabled?: boolean,
 *   apiKey?: string|null,
 *   model?: string,
 *   transport?: object,
 *   timeoutMs?: number,
 * } [options]
 */
export function createClaudeProvider(options = {}) {
    const callsEnabled = options.callsEnabled === true;
    const model = options.model || CLAUDE_DEFAULT_MODEL;
    const transport = options.transport || createHttpTransport({ timeoutMs: options.timeoutMs });
    const nullFallback = createNullProvider();
    const apiKey = options.apiKey || null;

    function keyPresent() {
        return !!(apiKey && String(apiKey).length > 0);
    }

    return {
        id: CLAUDE_PROVIDER_ID,
        async complete(req) {
            assertCompletionRequest(req);
            if (!callsEnabled || !keyPresent()) {
                const fallback = await nullFallback.complete(req);
                return {
                    ...fallback,
                    providerId: CLAUDE_PROVIDER_ID,
                    model,
                    deterministic: true,
                    networkCalled: false,
                    raw: {
                        ...(fallback.raw || {}),
                        note: 'provider_inactive_or_missing_key',
                        requestedProvider: CLAUDE_PROVIDER_ID,
                        callsEnabled,
                        keyConfigured: keyPresent(),
                        keyStatus: maskSecret(apiKey).masked,
                        endpointNote: 'https://api.anthropic.com/v1/messages',
                        transportReady: !!transport,
                    },
                };
            }
            const err = new Error('Claude live calls are not activated in Phase 1C.4 defaults');
            err.code = 'WHATSAPP_AI_PROVIDER_CALLS_BLOCKED';
            throw err;
        },
        async healthCheck() {
            return {
                ok: true,
                providerId: CLAUDE_PROVIDER_ID,
                networkCalled: false,
                callsEnabled,
                keyConfigured: keyPresent(),
                keyStatus: maskSecret(apiKey).masked,
                detail: callsEnabled && keyPresent() ? 'configured_inactive_until_owner_approval' : 'disabled_or_unconfigured',
            };
        },
        estimateCost(req = {}) {
            const tokens = estimateTokensRough((req.systemPrompt || '') + (req.userPrompt || ''));
            const usdPer1k = 0.003;
            return {
                currency: 'USD',
                estimatedUsd: Number(((tokens / 1000) * usdPer1k).toFixed(6)),
                providerId: CLAUDE_PROVIDER_ID,
                model,
                tokens,
            };
        },
        normalizeError(err) {
            return {
                code: err?.code || 'CLAUDE_ERROR',
                message: String(err?.message || err || 'unknown'),
                providerId: CLAUDE_PROVIDER_ID,
                retryable: false,
            };
        },
        supportsStructuredOutput() {
            return true;
        },
    };
}

export default createClaudeProvider;
