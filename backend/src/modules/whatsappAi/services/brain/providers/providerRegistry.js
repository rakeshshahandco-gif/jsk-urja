/**
 * Phase 1C.0 — Provider Registry (Adapter Pattern).
 * Registers providers by id; default is NullProvider. No vendor SDKs.
 */

import { isAiProvider } from './AiProvider.interface.js';
import { createNullProvider, NULL_PROVIDER_ID } from './adapters/null.adapter.js';

/**
 * @param {{ defaultProviderId?: string, providers?: Record<string, any> }} [options]
 */
export function createProviderRegistry(options = {}) {
    const providers = new Map();
    const nullProvider = createNullProvider();
    providers.set(NULL_PROVIDER_ID, nullProvider);

    if (options.providers && typeof options.providers === 'object') {
        for (const [id, provider] of Object.entries(options.providers)) {
            if (!isAiProvider(provider)) {
                throw new Error('Invalid AI provider registered for id=' + id);
            }
            providers.set(id, provider);
        }
    }

    let defaultProviderId = options.defaultProviderId || NULL_PROVIDER_ID;
    if (!providers.has(defaultProviderId)) {
        defaultProviderId = NULL_PROVIDER_ID;
    }

    return {
        register(id, provider) {
            if (!id || typeof id !== 'string') throw new Error('Provider id required');
            if (!isAiProvider(provider)) throw new Error('Invalid AI provider for id=' + id);
            providers.set(id, provider);
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
    };
}

export default createProviderRegistry;
