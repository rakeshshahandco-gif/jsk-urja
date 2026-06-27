import { searchWithSerpApi, isSerpApiConfigured } from './serpapiProvider.js';
import {
    searchWithGoogleCse,
    isGoogleCseConfigured,
    testGoogleCseConnection,
} from './googleCseProvider.js';
import { searchWithBing, isBingConfigured } from './bingSearchProvider.js';
import { isGoogleCseConfigured as isCseOk } from '../googleCredentials.service.js';

export const PROVIDER_IDS = ['google_cse', 'serpapi', 'bing'];

export const WEB_SEARCH_PROVIDERS = [
    {
        id: 'google_cse',
        label: 'Google Custom Search',
        recommended: true,
        isConfigured: isGoogleCseConfigured,
        envVars: ['DATA_EXTRACTOR_PROVIDER=google_cse', 'EXTRACTOR_GOOGLE_CSE_API_KEY', 'EXTRACTOR_GOOGLE_CSE_CX'],
        setupUrl: 'https://programmablesearchengine.google.com/controlpanel/all',
        apiUrl: 'https://console.cloud.google.com/apis/library/customsearch.googleapis.com',
    },
    {
        id: 'serpapi',
        label: 'SerpAPI',
        recommended: false,
        isConfigured: isSerpApiConfigured,
        envVars: ['DATA_EXTRACTOR_PROVIDER=serpapi', 'SERPAPI_KEY'],
        setupUrl: 'https://serpapi.com/',
    },
    {
        id: 'bing',
        label: 'Bing Search',
        recommended: false,
        isConfigured: isBingConfigured,
        envVars: ['DATA_EXTRACTOR_PROVIDER=bing', 'BING_SEARCH_API_KEY'],
        setupUrl: 'https://portal.azure.com/',
    },
];

export function getActiveProviderName() {
    return String(process.env.DATA_EXTRACTOR_PROVIDER || 'google_cse').trim().toLowerCase();
}

export function listWebSearchProviderStatus(settings = null) {
    const active = getActiveProviderName();
    return WEB_SEARCH_PROVIDERS.map((p) => ({
        id: p.id,
        label: p.label,
        recommended: p.recommended,
        configured: p.id === 'google_cse' ? isCseOk(settings) : p.isConfigured(),
        active: p.id === active,
        envVars: p.envVars,
        setupUrl: p.setupUrl || '',
        apiUrl: p.apiUrl || '',
    }));
}

export function isProviderConfigured(providerName = getActiveProviderName(), settings = null) {
    switch (providerName) {
        case 'serpapi':
            return isSerpApiConfigured();
        case 'google_cse':
            return isCseOk(settings);
        case 'bing':
            return isBingConfigured();
        default:
            return false;
    }
}

export function getProviderLabel(providerName = getActiveProviderName()) {
    switch (providerName) {
        case 'serpapi':
            return 'SerpAPI';
        case 'google_cse':
            return 'Google Custom Search';
        case 'bing':
            return 'Bing Search';
        default:
            return providerName;
    }
}

export function getWebSearchConfigMessage(settings = null) {
    const name = getActiveProviderName();
    if (isProviderConfigured(name, settings)) {
        return `Web Search is configured (${getProviderLabel(name)}).`;
    }
    if (name === 'google_cse' || !name) {
        return 'Google Custom Search is not configured. Add API key + cx in Data Extractor → Settings → Google API keys (or backend/.env).';
    }
    return `Web Search provider "${name}" is not configured. Check DATA_EXTRACTOR_PROVIDER and API keys.`;
}

export async function testWebSearchProvider(providerName = getActiveProviderName(), settings = null) {
    switch (providerName) {
        case 'google_cse':
            return testGoogleCseConnection(settings);
        case 'serpapi':
            if (!isSerpApiConfigured()) {
                return { ok: false, message: 'SERPAPI_KEY is not set in backend .env' };
            }
            return searchWithSerpApi({ query: 'manufacturer India', maxResults: 1 }).then(({ items, error }) => (
                error ? { ok: false, message: error } : { ok: true, message: `SerpAPI connected — ${items[0]?.title || 'OK'}` }
            ));
        case 'bing':
            if (!isBingConfigured()) {
                return { ok: false, message: 'BING_SEARCH_API_KEY is not set in backend .env' };
            }
            return searchWithBing({ query: 'manufacturer India', maxResults: 1 }).then(({ items, error }) => (
                error ? { ok: false, message: error } : { ok: true, message: `Bing connected — ${items[0]?.title || 'OK'}` }
            ));
        default:
            return { ok: false, message: `Unknown provider: ${providerName}` };
    }
}

export async function runWebSearchProvider({ query, maxResults, timeoutMs, settings = null }) {
    const providerName = getActiveProviderName();
    if (!isProviderConfigured(providerName, settings)) {
        return {
            items: [],
            error: getWebSearchConfigMessage(settings),
            providerName,
        };
    }

    const opts = { query, maxResults, timeoutMs, settings };
    switch (providerName) {
        case 'serpapi':
            return searchWithSerpApi(opts);
        case 'google_cse':
            return searchWithGoogleCse(opts);
        case 'bing':
            return searchWithBing(opts);
        default:
            return {
                items: [],
                error: `Unknown DATA_EXTRACTOR_PROVIDER: ${providerName}. Use serpapi, google_cse, or bing.`,
                providerName,
            };
    }
}
