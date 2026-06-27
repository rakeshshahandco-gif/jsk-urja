export function isBingConfigured() {
    return !!String(process.env.BING_SEARCH_API_KEY || '').trim();
}

export async function searchWithBing({ query, maxResults = 10, timeoutMs = 15000 }) {
    const apiKey = String(process.env.BING_SEARCH_API_KEY || '').trim();
    if (!apiKey) {
        return { items: [], error: 'BING_SEARCH_API_KEY is not set', providerName: 'bing' };
    }

    const cap = Math.min(50, Math.max(1, Number(maxResults) || 10));
    const url = new URL('https://api.bing.microsoft.com/v7.0/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(Math.min(50, cap)));

    const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Ocp-Apim-Subscription-Key': apiKey },
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { items: [], error: `Bing Search HTTP ${res.status}: ${body.slice(0, 180)}`, providerName: 'bing' };
    }

    const data = await res.json();
    const rows = data?.webPages?.value || [];
    const items = rows.slice(0, cap).map((row) => ({
        link: String(row.url || '').trim(),
        title: String(row.name || '').trim(),
        snippet: String(row.snippet || '').trim(),
    }));

    return { items, error: '', providerName: 'bing' };
}
