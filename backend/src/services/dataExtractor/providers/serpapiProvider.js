export function isSerpApiConfigured() {
    return !!String(process.env.SERPAPI_KEY || '').trim();
}

export async function searchWithSerpApi({ query, maxResults = 10, timeoutMs = 15000 }) {
    const apiKey = String(process.env.SERPAPI_KEY || '').trim();
    if (!apiKey) {
        return { items: [], error: 'SERPAPI_KEY is not set', providerName: 'serpapi' };
    }

    const items = [];
    let start = 0;
    const cap = Math.min(50, Math.max(1, Number(maxResults) || 10));

    while (items.length < cap && start <= 40) {
        const url = new URL('https://serpapi.com/search.json');
        url.searchParams.set('engine', 'google');
        url.searchParams.set('q', query);
        url.searchParams.set('api_key', apiKey);
        url.searchParams.set('num', '10');
        if (start > 0) url.searchParams.set('start', String(start));

        const res = await fetch(url.toString(), { signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            return { items, error: `SerpAPI HTTP ${res.status}: ${body.slice(0, 180)}`, providerName: 'serpapi' };
        }

        const data = await res.json();
        const organic = data?.organic_results || [];
        if (!organic.length) break;

        for (const row of organic) {
            if (items.length >= cap) break;
            items.push({
                link: String(row.link || '').trim(),
                title: String(row.title || '').trim(),
                snippet: String(row.snippet || '').trim(),
            });
        }

        start += 10;
        if (organic.length < 10) break;
    }

    return { items, error: '', providerName: 'serpapi' };
}
