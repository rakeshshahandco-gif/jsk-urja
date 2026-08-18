import { ApiError } from '../../../../utils/ApiError.js';

function isAllowedGoogleHost(hostname) {
    const h = String(hostname || '').toLowerCase();
    return h === 'google.com' || h === 'www.google.com' || h === 'google.co.in' || h === 'www.google.co.in';
}

function isAllowedBaiduHost(hostname) {
    const h = String(hostname || '').toLowerCase();
    return h === 'baidu.com' || h === 'www.baidu.com' || h === 'm.baidu.com';
}

function isAllowed1688Host(hostname) {
    const h = String(hostname || '').toLowerCase();
    return h === '1688.com' || h === 'www.1688.com' || h === 's.1688.com' || h.endsWith('.1688.com');
}

function isAllowedSogouHost(hostname) {
    const h = String(hostname || '').toLowerCase();
    return h === 'sogou.com' || h === 'www.sogou.com';
}

function isAllowed360Host(hostname) {
    const h = String(hostname || '').toLowerCase();
    return h === 'so.com' || h === 'www.so.com';
}

export function assistedSourceFromUrl(rawUrl) {
    try {
        const h = new URL(String(rawUrl || '')).hostname.toLowerCase();
        if (isAllowedGoogleHost(h)) return 'google';
        if (isAllowedBaiduHost(h)) return 'baidu';
        if (isAllowed1688Host(h)) return '1688';
        if (isAllowedSogouHost(h)) return 'sogou';
        if (isAllowed360Host(h)) return 'so360';
        if (h === 'facebook.com' || h === 'www.facebook.com' || h === 'm.facebook.com') return 'facebook';
        if (h === 'instagram.com' || h === 'www.instagram.com') return 'instagram';
        if (h === 'linkedin.com' || h === 'www.linkedin.com') return 'linkedin';
        if (h === 'x.com' || h === 'twitter.com' || h === 'www.twitter.com') return 'x';
        return '';
    } catch {
        return '';
    }
}

export function validateGoogleSearchUrl(rawUrl) {
    const text = String(rawUrl || '').trim();
    if (!text) throw new ApiError(400, 'Search query has no searchUrl');

    let parsed;
    try {
        parsed = new URL(text);
    } catch {
        throw new ApiError(400, 'Search query searchUrl is invalid');
    }

    if (parsed.protocol !== 'https:') throw new ApiError(400, 'Search query searchUrl must be HTTPS Google URL');
    if (!isAllowedGoogleHost(parsed.hostname)) throw new ApiError(400, 'Search query searchUrl must be google.com or google.co.in');
    if (parsed.pathname !== '/search') throw new ApiError(400, 'Search query searchUrl must point to /search');
    if (!parsed.searchParams.get('q')) throw new ApiError(400, 'Search query searchUrl must include q parameter');

    return parsed.toString();
}

export function validateAssistedSearchUrl(rawUrl) {
    const text = String(rawUrl || '').trim();
    if (!text) throw new ApiError(400, 'Search query has no searchUrl');
    let parsed;
    try {
        parsed = new URL(text);
    } catch {
        throw new ApiError(400, 'Search query searchUrl is invalid');
    }
    if (parsed.protocol !== 'https:') throw new ApiError(400, 'Search query searchUrl must be HTTPS');
    const host = parsed.hostname.toLowerCase();
    if (isAllowedGoogleHost(host)) return validateGoogleSearchUrl(text);
    if (isAllowedBaiduHost(host)) {
        if (!parsed.pathname.startsWith('/s')) throw new ApiError(400, 'Baidu searchUrl must point to /s');
        if (!parsed.searchParams.get('wd')) throw new ApiError(400, 'Baidu searchUrl must include wd parameter');
        return parsed.toString();
    }
    if (isAllowed1688Host(host)) {
        if (!/s\.html|\/s\//.test(parsed.pathname) && parsed.pathname !== '/s.html') {
            if (!parsed.searchParams.get('keywords') && !parsed.searchParams.get('q')) {
                throw new ApiError(400, '1688 searchUrl must include keywords');
            }
        }
        if (!parsed.searchParams.get('keywords') && !parsed.searchParams.get('q')) {
            throw new ApiError(400, '1688 searchUrl must include keywords');
        }
        return parsed.toString();
    }
    if (isAllowedSogouHost(host)) {
        if (!parsed.pathname.startsWith('/web')) throw new ApiError(400, 'Sogou searchUrl must point to /web');
        if (!parsed.searchParams.get('query')) throw new ApiError(400, 'Sogou searchUrl must include query parameter');
        return parsed.toString();
    }
    if (isAllowed360Host(host)) {
        if (!parsed.pathname.startsWith('/s')) throw new ApiError(400, '360 Search URL must point to /s');
        if (!parsed.searchParams.get('q')) throw new ApiError(400, '360 Search URL must include q parameter');
        return parsed.toString();
    }
    if (host === 'facebook.com' || host === 'www.facebook.com' || host === 'm.facebook.com') {
        return parsed.toString();
    }
    if (host === 'instagram.com' || host === 'www.instagram.com') {
        return parsed.toString();
    }
    if (host === 'linkedin.com' || host === 'www.linkedin.com') {
        return parsed.toString();
    }
    if (host === 'x.com' || host === 'twitter.com' || host === 'www.twitter.com') {
        return parsed.toString();
    }
    throw new ApiError(400, 'Search query searchUrl must be Google, Baidu, 1688, Sogou, 360, Facebook, Instagram, LinkedIn, or X');
}

/**
 * Build the next normal Google results page URL (start=10,20,...).
 * Page 1 => start omitted/0; next page from currentPageIndex (1-based) uses start = currentPageIndex * 10.
 */
export function buildNextGoogleResultsPageUrl(rawUrl, currentPageIndex = 1) {
    const validated = validateGoogleSearchUrl(rawUrl);
    const parsed = new URL(validated);
    const current = Math.max(1, Number(currentPageIndex) || 1);
    const nextPage = current + 1;
    const start = current * 10; // page1->page2 start=10
    parsed.searchParams.set('start', String(start));
    // Keep a stable search path; strip num if present is fine
    return { url: validateGoogleSearchUrl(parsed.toString()), nextPageIndex: nextPage, start };
}

export function buildNextAssistedPageUrl(rawUrl, currentPageIndex = 1) {
    const source = assistedSourceFromUrl(rawUrl);
    if (source === 'google' || !source) return buildNextGoogleResultsPageUrl(rawUrl, currentPageIndex);
    const current = Math.max(1, Number(currentPageIndex) || 1);
    const nextPage = current + 1;
    const parsed = new URL(validateAssistedSearchUrl(rawUrl));
    if (source === 'baidu' || source === 'so360') {
        parsed.searchParams.set('pn', String(current * 10));
        return { url: parsed.toString(), nextPageIndex: nextPage, start: current * 10 };
    }
    if (source === 'sogou') {
        parsed.searchParams.set('page', String(nextPage));
        return { url: parsed.toString(), nextPageIndex: nextPage, start: nextPage };
    }
    parsed.searchParams.set('beginPage', String(nextPage));
    return { url: parsed.toString(), nextPageIndex: nextPage, start: nextPage };
}

export function readGooglePageIndexFromUrl(rawUrl) {
    try {
        const parsed = new URL(String(rawUrl || ''));
        const start = Number(parsed.searchParams.get('start') || parsed.searchParams.get('pn') || 0);
        if (!Number.isFinite(start) || start <= 0) {
            const begin = Number(parsed.searchParams.get('beginPage') || 0);
            return begin > 1 ? begin : 1;
        }
        return Math.floor(start / 10) + 1;
    } catch {
        return 1;
    }
}