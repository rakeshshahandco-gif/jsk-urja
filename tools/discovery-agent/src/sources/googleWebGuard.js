/**
 * Keep Data Extractor on Google Web/All results.
 * Detects Jobs / Images / Shopping verticals and retries once with udm=14.
 * Does not fake location or bypass consent/captcha.
 */

const VERTICAL_TBM = new Set(['jobs', 'isch', 'shop', 'vid', 'nws']);
const VERTICAL_UDM = new Set(['2', '7', '28']);

export function isGoogleVerticalUrl(url) {
    try {
        const u = new URL(String(url || ''));
        const tbm = String(u.searchParams.get('tbm') || '').toLowerCase();
        if (VERTICAL_TBM.has(tbm)) return true;
        const udm = String(u.searchParams.get('udm') || '');
        return VERTICAL_UDM.has(udm);
    } catch {
        return false;
    }
}

export function forceGoogleWebSearchUrl(url) {
    try {
        const u = new URL(String(url || ''));
        if (!/google\./i.test(u.hostname)) return String(url || '');
        const tbm = String(u.searchParams.get('tbm') || '').toLowerCase();
        if (VERTICAL_TBM.has(tbm)) u.searchParams.delete('tbm');
        const udm = String(u.searchParams.get('udm') || '');
        if (!udm || VERTICAL_UDM.has(udm) || udm !== '14') {
            u.searchParams.set('udm', '14');
        }
        return u.toString();
    } catch {
        return String(url || '');
    }
}

export function looksLikeGoogleJobsOrVerticalHtml(html) {
    const s = String(html || '');
    if (/[?&]tbm=(jobs|isch|shop|vid)\b/i.test(s)) return true;
    if (/[?&]udm=(2|7|28)\b/i.test(s)) return true;
    if (/\bJob type\b/i.test(s) && /\bDate posted\b/i.test(s)) return true;
    if (/\bJobs\b/i.test(s) && /\bRemote\b/i.test(s) && /\bJob type\b/i.test(s)) return true;
    return false;
}

export async function ensureGoogleWebResultsPage(page) {
    const url = page.url();
    const html = await page.content().catch(() => '');
    const vertical = isGoogleVerticalUrl(url) || looksLikeGoogleJobsOrVerticalHtml(html);
    if (!vertical) return { retried: false, stillVertical: false };

    const next = forceGoogleWebSearchUrl(url);
    if (!next || next === url) {
        return { retried: false, stillVertical: true };
    }
    await page.goto(next, { waitUntil: 'domcontentloaded' });
    const html2 = await page.content().catch(() => '');
    const still = isGoogleVerticalUrl(page.url()) || looksLikeGoogleJobsOrVerticalHtml(html2);
    return { retried: true, stillVertical: still };
}
