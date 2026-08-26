/**
 * Redirect-safe public fetch (SSRF on every hop). http/https only.
 */
import { isUrlAllowedByRobots } from '../../robotsCheck.js';
import { assertResolvedPublicUrl } from '../../discovery/ssrfGuard.js';
import { MAX_REDIRECTS, PAGE_FETCH_TIMEOUT_MS } from '../rawCaptureEnrichment/constants.js';

const USER_AGENT = 'CRM-Data-Extractor-ChinaCrawl/1.0 (+localhost; public-business-pages-only)';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchPublicHtml(url, opts = {}) {
    const timeoutMs = opts.timeoutMs || PAGE_FETCH_TIMEOUT_MS;
    const maxRedirects = Number.isFinite(opts.maxRedirects) ? opts.maxRedirects : MAX_REDIRECTS;
    let current;
    try {
        current = await assertResolvedPublicUrl(url);
    } catch (err) {
        return { ok: false, blocked: false, error: err?.message || 'Unsafe URL', html: '', finalUrl: String(url || '') };
    }

    for (let hop = 0; hop <= maxRedirects; hop++) {
        const robotsOk = await isUrlAllowedByRobots(current, 5000);
        if (!robotsOk) {
            return { ok: false, blocked: true, error: 'Blocked by robots.txt', html: '', finalUrl: current };
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(current, {
                signal: controller.signal,
                headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': USER_AGENT },
                redirect: 'manual',
            });
            if ([301, 302, 303, 307, 308].includes(res.status)) {
                const loc = res.headers.get('location');
                if (!loc) {
                    return { ok: false, blocked: false, error: 'Redirect without Location', html: '', finalUrl: current };
                }
                let next;
                try {
                    next = new URL(loc, current).href;
                } catch {
                    return { ok: false, blocked: false, error: 'Invalid redirect URL', html: '', finalUrl: current };
                }
                try {
                    current = await assertResolvedPublicUrl(next);
                } catch (err) {
                    return { ok: false, blocked: false, error: err?.message || 'Unsafe redirect', html: '', finalUrl: current };
                }
                continue;
            }
            if (!res.ok) {
                return { ok: false, blocked: res.status === 403 || res.status === 401, error: `HTTP ${res.status}`, html: '', finalUrl: current };
            }
            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
                return { ok: false, blocked: false, error: 'Non-HTML response', html: '', finalUrl: current };
            }
            const html = await res.text();
            if (html.length > 2_000_000) {
                return { ok: false, blocked: false, error: 'Response too large', html: '', finalUrl: current };
            }
            return { ok: true, blocked: false, error: '', html, finalUrl: res.url || current };
        } catch (err) {
            const msg = err?.name === 'AbortError' ? 'Fetch timeout' : (err?.message || 'Fetch failed');
            return { ok: false, blocked: false, error: msg, html: '', finalUrl: current };
        } finally {
            clearTimeout(timer);
        }
    }
    return { ok: false, blocked: false, error: 'Too many redirects', html: '', finalUrl: current };
}

export async function delayMs(ms) {
    if (!ms || ms < 1) return;
    await sleep(ms);
}
