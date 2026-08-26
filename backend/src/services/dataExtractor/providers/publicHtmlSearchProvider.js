/**
 * Public HTML search discovery — no paid API key required.
 * Uses DuckDuckGo HTML/lite, then Bing HTML as a fallback.
 * Does not bypass CAPTCHA, logins, or bot-protection challenges.
 * On HTTP 403/429: record, stop that provider, do not retry endlessly.
 */
const USER_AGENT = 'Mozilla/5.0 (compatible; CRM-DataExtractor/1.0; public-business-discovery)';
const MAX_BODY_BYTES = 400_000;
const FETCH_TIMEOUT_MS = 12000;
const MAX_NETWORK_RETRIES = 1;

const BLOCKED_STATUSES = new Set([401, 403, 429, 503]);

function classifyHttp(status, body = '') {
    const text = String(body || '').slice(0, 240);
    if (status === 429) {
        return {
            statusCode: 'RATE_LIMITED',
            error: `Search provider temporarily blocked the request (HTTP 429). This query was paused and will not be retried continuously.`,
        };
    }
    if (status === 403 || status === 401) {
        return {
            statusCode: 'BLOCKED',
            error: `Search provider temporarily blocked the request (HTTP ${status}). This query was paused and will not be retried continuously.`,
        };
    }
    if (/captcha|unusual traffic|enable javascript|consent/i.test(text)) {
        return {
            statusCode: 'BLOCKED',
            error: 'Search provider asked for verification (CAPTCHA/consent). Public HTML discovery stopped for this provider; it will not be bypassed.',
        };
    }
    return {
        statusCode: 'FAILED',
        error: `Search provider HTTP ${status}: ${text.slice(0, 160)}`,
    };
}

function decodeDuckRedirect(href) {
    const raw = String(href || '').trim();
    if (!raw) return '';
    try {
        const absolute = raw.startsWith('http') ? raw : `https:${raw.replace(/^\/\//, '//')}`;
        const u = new URL(absolute, 'https://duckduckgo.com');
        const uddg = u.searchParams.get('uddg');
        if (uddg) return decodeURIComponent(uddg);
        if (/duckduckgo\.com$/i.test(u.hostname)) return '';
        return u.href;
    } catch {
        return raw.startsWith('http') ? raw : '';
    }
}

function stripTags(html) {
    return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseDuckDuckGoHtml(html) {
    const items = [];
    const seen = new Set();
    const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const link = decodeDuckRedirect(m[1].replace(/&amp;/g, '&'));
        if (!link || !/^https?:\/\//i.test(link)) continue;
        const key = link.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
            link,
            title: stripTags(m[2]).slice(0, 300),
            snippet: '',
        });
    }
    const snippets = [...html.matchAll(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)];
    snippets.forEach((s, i) => {
        if (items[i] && !items[i].snippet) items[i].snippet = stripTags(s[1]).slice(0, 500);
    });
    return items;
}

function parseDuckDuckGoLite(html) {
    const items = [];
    const seen = new Set();
    const re = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const href = m[1].replace(/&amp;/g, '&');
        if (/duckduckgo\.com|duck\.com/i.test(href)) continue;
        const link = decodeDuckRedirect(href) || href;
        if (!/^https?:\/\//i.test(link)) continue;
        const key = link.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
            link,
            title: stripTags(m[2]).slice(0, 300),
            snippet: '',
        });
    }
    return items;
}

function parseBingHtml(html) {
    const items = [];
    const seen = new Set();
    const re = /<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>)?/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const link = String(m[1] || '').replace(/&amp;/g, '&').trim();
        if (!/^https?:\/\//i.test(link)) continue;
        if (/bing\.com|microsoft\.com/i.test(link) && /\/search\?/i.test(link)) continue;
        const key = link.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
            link,
            title: stripTags(m[2]).slice(0, 300),
            snippet: stripTags(m[3] || '').slice(0, 500),
        });
    }
    return items;
}

async function fetchHtml(url) {
    let lastErr = null;
    for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                method: 'GET',
                redirect: 'follow',
                headers: {
                    Accept: 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-IN,en;q=0.9',
                    'User-Agent': USER_AGENT,
                },
                signal: controller.signal,
            });
            const buf = Buffer.from(await res.arrayBuffer());
            const body = buf.subarray(0, MAX_BODY_BYTES).toString('utf8');
            return { status: res.status, ok: res.ok, body };
        } catch (err) {
            lastErr = err;
            if (attempt < MAX_NETWORK_RETRIES) {
                await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
                continue;
            }
        } finally {
            clearTimeout(timer);
        }
    }
    return { status: 0, ok: false, body: '', error: lastErr?.message || 'Search request failed' };
}

export function isPublicHtmlSearchConfigured() {
    return true;
}

export async function testPublicHtmlSearch() {
    const result = await searchWithPublicHtml({ query: 'manufacturer India', maxResults: 3 });
    if (result.error && !result.items.length) {
        return { ok: false, status: result.statusCode || 'FAILED', message: result.error };
    }
    return {
        ok: true,
        status: 'CONNECTED',
        message: `Public web discovery ready (${result.providerName}) — ${result.items[0]?.title || 'OK'}`,
    };
}

/**
 * @returns {{ items: Array<{link:string,title:string,snippet:string}>, error: string, providerName: string, statusCode: string, pagesFetched: number }}
 */
export async function searchWithPublicHtml({
    query,
    maxResults = 10,
    timeoutMs,
} = {}) {
    void timeoutMs;
    const q = String(query || '').trim();
    if (!q) {
        return { items: [], error: 'Search query is empty', providerName: 'public_web', statusCode: 'FAILED', pagesFetched: 0 };
    }
    const cap = Math.min(20, Math.max(1, Number(maxResults) || 10));

    const ddgLite = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`;
    const lite = await fetchHtml(ddgLite);
    if (lite.error && !lite.status) {
        // network — try next provider
    } else if (BLOCKED_STATUSES.has(lite.status) || /captcha|unusual traffic/i.test(lite.body || '')) {
        const classified = classifyHttp(lite.status || 403, lite.body);
        const bingTry = await searchBingHtml(q, cap);
        if (bingTry.items.length) return bingTry;
        return { items: [], error: classified.error, providerName: 'duckduckgo_html', statusCode: classified.statusCode, pagesFetched: 1 };
    } else if (lite.ok) {
        let items = parseDuckDuckGoLite(lite.body).slice(0, cap);
        if (items.length < 3) {
            const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
            const html = await fetchHtml(htmlUrl);
            if (html.ok) {
                const extra = parseDuckDuckGoHtml(html.body);
                const seen = new Set(items.map((i) => i.link.toLowerCase()));
                for (const row of extra) {
                    if (items.length >= cap) break;
                    if (seen.has(row.link.toLowerCase())) continue;
                    seen.add(row.link.toLowerCase());
                    items.push(row);
                }
            }
        }
        if (items.length) {
            return { items: items.slice(0, cap), error: '', providerName: 'duckduckgo_html', statusCode: '', pagesFetched: 1 };
        }
    }

    return searchBingHtml(q, cap);
}

async function searchBingHtml(query, cap) {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en-IN`;
    const res = await fetchHtml(url);
    if (res.error && !res.status) {
        return { items: [], error: `Website bing.com did not respond within timeout. Candidate retained for later review.`, providerName: 'bing_html', statusCode: 'FAILED', pagesFetched: 0 };
    }
    if (BLOCKED_STATUSES.has(res.status) || /captcha|unusual traffic/i.test(res.body || '')) {
        const classified = classifyHttp(res.status || 403, res.body);
        return { items: [], error: classified.error, providerName: 'bing_html', statusCode: classified.statusCode, pagesFetched: 1 };
    }
    const items = parseBingHtml(res.body || '').slice(0, cap);
    if (!items.length) {
        return {
            items: [],
            error: 'Public web discovery returned no usable results for this query.',
            providerName: 'bing_html',
            statusCode: res.ok ? '' : 'FAILED',
            pagesFetched: 1,
        };
    }
    return { items, error: '', providerName: 'bing_html', statusCode: '', pagesFetched: 1 };
}
