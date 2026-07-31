import { ApiError } from '../../../../utils/ApiError.js';

function isAllowedGoogleHost(hostname) {
    const h = String(hostname || '').toLowerCase();
    return h === 'google.com' || h === 'www.google.com' || h === 'google.co.in' || h === 'www.google.co.in';
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

export function readGooglePageIndexFromUrl(rawUrl) {
    try {
        const parsed = new URL(String(rawUrl || ''));
        const start = Number(parsed.searchParams.get('start') || 0);
        if (!Number.isFinite(start) || start <= 0) return 1;
        return Math.floor(start / 10) + 1;
    } catch {
        return 1;
    }
}