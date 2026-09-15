import { detectCaptchaOrBlock, stripSecrets, sleep } from '../safety.js';

const SEARCH_BATCH_MAX = 10;

function isFacebookLoggedIn(cookies = []) {
    return cookies.some((c) => c && (c.name === 'c_user' || c.name === 'xs'));
}

function cleanName(raw) {
    return String(raw || '')
        .replace(/\s+/g, ' ')
        .replace(/\| Facebook$/i, '')
        .trim()
        .slice(0, 200);
}

/**
 * Bounded Direct Facebook Business/Pages discovery on the local isolated profile.
 * Does not bypass CAPTCHA or access controls. Cookies never leave this PC.
 */
export async function runFacebookDirectAgent(page, context, job, { onRecords, onExpired, onManual, shouldStop }) {
    const cookies = await context.cookies().catch(() => []);
    if (!isFacebookLoggedIn(cookies)) {
        await onExpired('FACEBOOK_SESSION_EXPIRED');
        return { collected: [], expired: true, reason: 'FACEBOOK_SESSION_EXPIRED' };
    }

    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    const blockHome = await detectCaptchaOrBlock(page);
    if (blockHome.blocked) {
        await onManual(blockHome.reason);
        return { collected: [], stopped: true, reason: blockHome.reason };
    }

    const stillIn = await context.cookies().catch(() => []);
    if (!isFacebookLoggedIn(stillIn) || /\/login/i.test(page.url())) {
        await onExpired('FACEBOOK_SESSION_EXPIRED');
        return { collected: [], expired: true, reason: 'FACEBOOK_SESSION_EXPIRED' };
    }

    const q = [job.keyword, job.city || job.metadata?.location].filter(Boolean).join(' ');
    if (q) {
        await page.goto('https://www.facebook.com/search/pages/?q=' + encodeURIComponent(q), {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
        });
    }
    if (shouldStop && shouldStop()) return { collected: [], stopped: true };

    const blockSearch = await detectCaptchaOrBlock(page);
    if (blockSearch.blocked) {
        await onManual(blockSearch.reason);
        return { collected: [], stopped: true, reason: blockSearch.reason };
    }

    await sleep(5000);
    await page.evaluate(() => window.scrollBy(0, 1200)).catch(() => {});
    await sleep(2000);

    const rows = await page.evaluate((max) => {
        const chromePath = /\/(groups|login|watch|marketplace|reel|stories|photo\.php|permalink|messages|gaming|notifications|friends|settings|help|bookmarks)\//i;
        const chromeHost = /facebook\.com\/(search|pages\/search|sharer|home\.php|gaming|messages)(\/|$)/i;
        const chromeName = /message not restored|unread message|see all in messenger|you sent an attachment|what's on your mind|notifications/i;
        function pageLike(url) {
            try {
                const u = new URL(url);
                if (!/facebook\.com$/i.test(u.hostname.replace(/^www\./, '')) && !/\.facebook\.com$/i.test(u.hostname)) return false;
                const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
                if (!parts.length) return false;
                const first = String(parts[0] || '').toLowerCase();
                if (['watch', 'gaming', 'reel', 'stories', 'marketplace', 'messages', 'search', 'login', 'friends', 'notifications'].includes(first)) return false;
                if (first === 'profile.php') return true;
                if (first === 'pages' && parts.length >= 2) return true;
                return parts.length === 1;
            } catch {
                return false;
            }
        }
        const out = [];
        const seen = new Set();
        const roots = Array.from(document.querySelectorAll('[role="feed"], [role="main"], [role="article"]'));
        const scope = roots.length ? roots.flatMap((r) => Array.from(r.querySelectorAll('a[href]'))) : Array.from(document.querySelectorAll('a[href]'));
        for (const a of scope) {
            if (out.length >= max) break;
            const href = String(a.href || '');
            if (!/facebook\.com\//i.test(href)) continue;
            if (chromePath.test(href) || chromeHost.test(href)) continue;
            const url = href.split('?')[0].replace(/\/$/, '');
            if (!pageLike(href) && !pageLike(url)) continue;
            if (seen.has(url)) continue;
            const name = (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
            if (!name || name.length < 2 || chromeName.test(name)) continue;
            seen.add(url);
            const card = a.closest('[role="article"]') || a.closest('div') || a.parentElement;
            const snippet = card ? String(card.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400) : '';
            out.push({ href: url, name, snippet });
        }
        return out;
    }, SEARCH_BATCH_MAX);

    const collected = [];
    for (const row of rows || []) {
        collected.push(stripSecrets({
            title: cleanName(row.name),
            name: cleanName(row.name),
            resultUrl: row.href,
            sourceUrl: row.href,
            snippet: String(row.snippet || '').slice(0, 400),
            resultTypeHint: 'facebook_page',
            pageType: 'page',
            sourcePlatform: 'facebook',
            rawExtractedData: {
                extractionMode: 'direct-agent',
                source: 'facebook',
                usedServerPuppeteer: false,
            },
        }));
    }
    if (collected.length) await onRecords(collected, page.url());
    return { collected, stopped: false, expired: false };
}
