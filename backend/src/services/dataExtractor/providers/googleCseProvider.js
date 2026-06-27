import {
    getGoogleCseCredentials,
    isGoogleCseConfigured as isCseConfigured,
} from '../googleCredentials.service.js';

export function isGoogleCseConfigured(settings = null) {
    return isCseConfigured(settings);
}

export async function searchWithGoogleCse({ query, maxResults = 10, timeoutMs = 15000, settings = null }) {
    const { apiKey, cx } = getGoogleCseCredentials(settings);
    if (!apiKey || !cx) {
        return {
            items: [],
            error: 'Google Custom Search is not configured. Add API key + Search engine ID (cx) in Data Extractor → Settings → Google API keys, or in backend/.env',
            providerName: 'google_cse',
        };
    }

    const items = [];
    let start = 1;
    const cap = Math.min(50, Math.max(1, Number(maxResults) || 10));

    while (items.length < cap && start <= 41) {
        const url = new URL('https://www.googleapis.com/customsearch/v1');
        url.searchParams.set('key', apiKey);
        url.searchParams.set('cx', cx);
        url.searchParams.set('q', query);
        url.searchParams.set('num', '10');
        url.searchParams.set('start', String(start));

        const res = await fetch(url.toString(), { signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            return { items, error: `Google CSE HTTP ${res.status}: ${body.slice(0, 180)}`, providerName: 'google_cse' };
        }

        const data = await res.json();
        const rows = data?.items || [];
        if (!rows.length) break;

        for (const row of rows) {
            if (items.length >= cap) break;
            items.push({
                link: String(row.link || '').trim(),
                title: String(row.title || '').trim(),
                snippet: String(row.snippet || '').trim(),
            });
        }

        start += 10;
        if (rows.length < 10) break;
    }

    return { items, error: '', providerName: 'google_cse' };
}

export async function testGoogleCseConnection(settings = null) {
    if (!isGoogleCseConfigured(settings)) {
        return {
            ok: false,
            message: 'Add Google CSE API key + Search engine ID (cx) in Data Extractor → Settings → Google API keys (or backend/.env), then Save.',
        };
    }
    const { items, error } = await searchWithGoogleCse({
        query: 'manufacturer India',
        maxResults: 1,
        timeoutMs: 15000,
        settings,
    });
    if (error) return { ok: false, message: error };
    return {
        ok: true,
        message: `Google Custom Search connected — sample result: ${items[0]?.title || 'OK'}`,
        sampleCount: items.length,
    };
}
