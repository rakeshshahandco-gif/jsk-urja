/**
 * Phase 1C.4 — Provider Registry with company selection, kill switch, null fallback.
 * Real provider network calls remain disabled by default.
 */

import { isAiProvider } from './AiProvider.interface.js';
import { createNullProvider, NULL_PROVIDER_ID } from './adapters/null.adapter.js';
import { createOpenAIProvider, OPENAI_PROVIDER_ID } from './adapters/openai.adapter.js';
import { createGeminiProvider, GEMINI_PROVIDER_ID } from './adapters/gemini.adapter.js';
import { createClaudeProvider, CLAUDE_PROVIDER_ID } from './adapters/claude.adapter.js';
import { createLocalLlmProvider, LOCAL_PROVIDER_ID } from './adapters/localLlm.adapter.js';
import {
    DEFAULT_PROVIDER_RUNTIME_CONFIG,
    PROVIDER_FRAMEWORK_VERSION,
    resolveCompanyProviderConfig,
} from './providerDefaults.js';
import { assertNoApiKeysInPayload, secretStatus } from './providerSecrets.js';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {{
 *   defaultProviderId?: string,
 *   providers?: Record<string, any>,
 *   runtime?: object,
 *   registerDefaults?: boolean,
 * }} [options]
 */
export function createProviderRegistry(options = {}) {
    const providers = new Map();
    const nullProvider = createNullProvider();
    providers.set(NULL_PROVIDER_ID, nullProvider);

    const registerDefaults = options.registerDefaults !== false;
    if (registerDefaults) {
        providers.set(OPENAI_PROVIDER_ID, createOpenAIProvider({ callsEnabled: false }));
        providers.set(GEMINI_PROVIDER_ID, createGeminiProvider({ callsEnabled: false }));
        providers.set(CLAUDE_PROVIDER_ID, createClaudeProvider({ callsEnabled: false }));
        providers.set(LOCAL_PROVIDER_ID, createLocalLlmProvider({ callsEnabled: false }));
    }

    if (options.providers && typeof options.providers === 'object') {
        for (const [id, provider] of Object.entries(options.providers)) {
            if (!isAiProvider(provider)) {
                throw new Error('Invalid AI provider registered for id=' + id);
            }
            providers.set(id, provider);
        }
    }

    let runtime = { ...DEFAULT_PROVIDER_RUNTIME_CONFIG, ...(options.runtime || {}) };
    let defaultProviderId = options.defaultProviderId
        || (runtime.providerEnabled && runtime.provider ? runtime.provider : NULL_PROVIDER_ID);
    if (!providers.has(defaultProviderId)) {
        defaultProviderId = NULL_PROVIDER_ID;
    }

    function selectProviderId(companyId, overrideId) {
        const cfg = resolveCompanyProviderConfig(companyId, runtime);
        if (cfg.killSwitch === true || cfg.providerEnabled !== true || cfg.outboundAllowed === true) {
            // outboundAllowed must never force a live provider; kill/disabled always null.
        }
        if (cfg.killSwitch === true || cfg.providerEnabled !== true) {
            return NULL_PROVIDER_ID;
        }
        const wanted = overrideId || cfg.provider || defaultProviderId;
        if (!wanted || wanted === 'null' || !providers.has(wanted)) {
            return NULL_PROVIDER_ID;
        }
        return wanted;
    }

    return {
        version: PROVIDER_FRAMEWORK_VERSION,
        register(id, provider) {
            if (!id || typeof id !== 'string') throw new Error('Provider id required');
            if (!isAiProvider(provider)) throw new Error('Invalid AI provider for id=' + id);
            providers.set(id, provider);
            return this;
        },
        disable(id) {
            providers.set(id, createNullProvider());
            return this;
        },
        listIds() {
            return [...providers.keys()];
        },
        has(id) {
            return providers.has(id);
        },
        get(id) {
            const key = id || defaultProviderId;
            return providers.get(key) || providers.get(NULL_PROVIDER_ID);
        },
        getDefault() {
            return this.get(defaultProviderId);
        },
        setDefault(id) {
            if (!providers.has(id)) throw new Error('Unknown provider id=' + id);
            defaultProviderId = id;
            return this;
        },
        getRuntimeConfig(companyId) {
            return resolveCompanyProviderConfig(companyId, runtime);
        },
        updateRuntime(partial = {}) {
            assertNoApiKeysInPayload(partial);
            runtime = { ...runtime, ...partial };
            if (partial.provider && providers.has(partial.provider) && partial.providerEnabled === true && runtime.killSwitch !== true) {
                defaultProviderId = partial.provider;
            }
            if (runtime.providerEnabled !== true || runtime.killSwitch === true) {
                defaultProviderId = NULL_PROVIDER_ID;
            }
            return this.getRuntimeConfig(null);
        },
        resolveForCompany(companyId, overrideId) {
            const id = selectProviderId(companyId, overrideId);
            return this.get(id);
        },
        /**
         * complete with timeout/retry/maxTokens/temperature; falls back to null on failure.
         */
        async completeForCompany(companyId, req, opts = {}) {
            const cfg = this.getRuntimeConfig(companyId);
            const provider = this.resolveForCompany(companyId, opts.providerId);
            const merged = {
                ...req,
                temperature: req.temperature ?? cfg.temperature,
                maxTokens: req.maxTokens ?? cfg.maxTokens,
                timeoutMs: req.timeoutMs ?? cfg.timeoutMs,
            };
            const attempts = Math.max(1, Number(cfg.retry?.maxAttempts) || 1);
            const backoff = Math.max(0, Number(cfg.retry?.backoffMs) || 0);
            let lastErr = null;
            for (let i = 0; i < attempts; i += 1) {
                try {
                    const result = await provider.complete(merged);
                    return {
                        ...result,
                        meta: {
                            companyId: companyId == null ? null : String(companyId),
                            selectedProviderId: provider.id,
                            providerEnabled: cfg.providerEnabled === true,
                            killSwitch: cfg.killSwitch === true,
                            mode: cfg.mode,
                            outboundAllowed: false,
                            attempt: i + 1,
                        },
                    };
                } catch (err) {
                    lastErr = err;
                    if (i + 1 < attempts && backoff) await sleep(backoff);
                }
            }
            const fallback = await nullProvider.complete(merged);
            return {
                ...fallback,
                meta: {
                    companyId: companyId == null ? null : String(companyId),
                    selectedProviderId: NULL_PROVIDER_ID,
                    fallbackReason: provider.normalizeError ? provider.normalizeError(lastErr) : String(lastErr),
                    providerEnabled: cfg.providerEnabled === true,
                    killSwitch: cfg.killSwitch === true,
                    mode: cfg.mode,
                    outboundAllowed: false,
                },
            };
        },
        async healthCheckAll() {
            const out = {};
            for (const id of providers.keys()) {
                // eslint-disable-next-line no-await-in-loop
                out[id] = await providers.get(id).healthCheck();
            }
            return out;
        },
        maskedSecretStatus(ref) {
            return secretStatus(ref);
        },
        assertSafeSettingsPayload(payload) {
            assertNoApiKeysInPayload(payload);
            return true;
        },
    };
}

export default createProviderRegistry;
