/**
 * Brave Search API provider — primary free-first web search for Business Discovery.
 * Key: settings.sourceConnectors.brave.apiKey or BRAVE_SEARCH_API_KEY env.
 * Never log or return the raw key.
 */
import { getControlledTestConfig } from '../controlledTestMode.js';

export function getBraveApiKey(settings = null) {
    const fromSettings = String(settings?.sourceConnectors?.brave?.apiKey || '').trim();
    if (fromSettings) return fromSettings;
    return String(process.env.BRAVE_SEARCH_API_KEY || '').trim();
}

export function getBraveConfig(settings = null) {
    const raw = settings?.sourceConnectors?.brave || {};
    const discovery = settings?.sourceConnectors?.discovery || {};
    const ctl = getControlledTestConfig(settings);
    const enabled = raw.enabled !== false && discovery.braveEnabled !== false;
    const monthlyLimit = Math.max(0, Number(raw.monthlySafetyLimit ?? discovery.monthlyRequestSafetyLimit) || 1000);
    const perJobLimit = Math.max(1, Number(raw.perJobLimit ?? discovery.perJobRequestLimit) || 20);
    const usageUsed = Math.max(0, Number(raw.usageUsed) || 0);
    return {
        enabled,
        apiKey: getBraveApiKey(settings),
        timeoutMs: Math.max(3000, Number(raw.timeoutMs) || 15000),
        requestDelayMs: Math.max(0, Number(raw.requestDelayMs ?? discovery.defaultRequestDelayMs) || 1000),
        perJobLimit: ctl.enabled ? Math.min(perJobLimit, ctl.maxSerpApiPages || 2) : perJobLimit,
        monthlyLimit,
        usageUsed,
        resultLimit: Math.min(20, Math.max(1, Number(raw.resultLimit) || 10)),
    };
}

export function isBraveConfigured(settings = null) {
    const cfg = getBraveConfig(settings);
    return cfg.enabled && !!cfg.apiKey;
}

function classifyBraveError(status, body = '') {
    const text = String(body || '');
    if (status === 401 || status === 403 || /invalid|unauthorized|forbidden/i.test(text)) {
        return {
            statusCode: 'INVALID_CREDENTIALS',
            error: 'Brave Search authentication failed. Please verify the API key in Data Extractor Settings.',
        };
    }
    if (status === 429 || /rate.?limit/i.test(text)) {
        return { statusCode: 'RATE_LIMITED', error: 'Brave Search rate limit reached. Try again later.' };
    }
    if (status === 402 || /quota|credit|payment/i.test(text)) {
        return { statusCode: 'CREDIT_LIMIT_REACHED', error: 'Brave Search credit/quota limit reached.' };
    }
    return {
        statusCode: 'FAILED',
        error: 'Brave Search HTTP ' + status + ': ' + text.slice(0, 160),
    };
}

export async function testBraveConnection(settings = null) {
    if (!isBraveConfigured(settings)) {
        return {
            ok: false,
            status: 'NOT_CONFIGURED',
            connectionStatus: 'NOT_CONFIGURED',
            message: 'Brave Search is not configured. Add BRAVE_SEARCH_API_KEY in Settings or backend/.env.local.',
        };
    }
    const result = await searchWithBrave({
        query: 'manufacturer India',
        maxResults: 1,
        maxPages: 1,
        settings,
    });
    if (result.error) {
        return {
            ok: false,
            status: result.statusCode || 'FAILED',
            connectionStatus: result.statusCode || 'FAILED',
            message: result.error,
        };
    }
    return {
        ok: true,
        status: 'CONNECTED',
        connectionStatus: 'CONNECTED',
        message: 'Brave Search connected — ' + (result.items[0]?.title || 'OK'),
    };
}

/**
 * Brave Web Search API (api.search.brave.com).
 * Pagination via offset (0, 10, 20...).
 */
export async function searchWithBrave({
    query,
    maxResults = 10,
    timeoutMs,
    settings = null,
    maxPages,
    requestDelayMs,
    offsetStart = 0,
} = {}) {
    const cfg = getBraveConfig(settings);
    if (!cfg.enabled) {
        return { items: [], error: 'Brave Search is disabled', providerName: 'brave', pagesFetched: 0, statusCode: 'FAILED' };
    }
    if (!cfg.apiKey) {
        return {
            items: [],
            error: 'Brave Search is not configured. Add BRAVE_SEARCH_API_KEY in Settings or backend/.env.local.',
            providerName: 'brave',
            pagesFetched: 0,
            statusCode: 'NOT_CONFIGURED',
        };
    }
    if (cfg.monthlyLimit > 0 && cfg.usageUsed >= cfg.monthlyLimit) {
        return {
            items: [],
            error: 'Brave Search monthly safety limit reached.',
            providerName: 'brave',
            pagesFetched: 0,
            statusCode: 'CREDIT_LIMIT_REACHED',
        };
    }

    const items = [];
    const cap = Math.min(cfg.resultLimit, Math.max(1, Number(maxResults) || 10));
    const pageLimit = Math.max(1, Number(maxPages != null ? maxPages : Math.min(cfg.perJobLimit, 5)) || 1);
    const timeout = Number(timeoutMs) || cfg.timeoutMs;
    const delayMs = requestDelayMs != null ? Number(requestDelayMs) : cfg.requestDelayMs;
    let pagesFetched = 0;
    let offset = Math.max(0, Number(offsetStart) || 0);
    let lastStatusCode = '';

    while (items.length < cap && pagesFetched < pageLimit) {
        if (pagesFetched > 0 && delayMs > 0) {
            await new Promise((r) => setTimeout(r, delayMs));
        }
        const url = new URL('https://api.search.brave.com/res/v1/web/search');
        url.searchParams.set('q', query);
        url.searchParams.set('count', '10');
        if (offset > 0) url.searchParams.set('offset', String(Math.min(offset, 9)));

        let res;
        try {
            res = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'X-Subscription-Token': cfg.apiKey,
                },
                signal: AbortSignal.timeout(timeout),
            });
        } catch (err) {
            return {
                items,
                error: err.message || 'Brave Search request failed',
                providerName: 'brave',
                pagesFetched,
                statusCode: 'FAILED',
                nextOffset: offset,
            };
        }

        pagesFetched += 1;
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            const classified = classifyBraveError(res.status, body);
            lastStatusCode = classified.statusCode;
            return {
                items,
                error: classified.error,
                providerName: 'brave',
                pagesFetched,
                statusCode: classified.statusCode,
                nextOffset: offset,
            };
        }

        const data = await res.json();
        const results = data?.web?.results || [];
        if (!results.length) break;

        for (const row of results) {
            if (items.length >= cap) break;
            items.push({
                link: String(row.url || '').trim(),
                title: String(row.title || '').trim(),
                snippet: String(row.description || row.extra_snippets?.[0] || '').trim(),
            });
        }

        offset += 1;
        if (results.length < 10) break;
        if (pagesFetched >= pageLimit) break;
    }

    return {
        items,
        error: '',
        providerName: 'brave',
        pagesFetched,
        statusCode: lastStatusCode || '',
        nextOffset: offset,
    };
}
