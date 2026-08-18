import { searchWithPublicHtml } from '../providers/publicHtmlSearchProvider.js';
import { classifyFacebookUrl, classifyInstagramUrl, facebookPublicQueries, instagramPublicQueries } from './classify.util.js';

/** Unwrap Bing/Duck redirect wrappers so facebook.com / instagram.com URLs can be classified. */
export function unwrapPublicResultLink(raw) {
    const link = String(raw || '').trim();
    if (!link) return '';
    try {
        const u = new URL(link);
        if (/bing\.com$/i.test(u.hostname.replace(/^www\./, '')) || u.hostname === 'www.bing.com') {
            const enc = u.searchParams.get('u');
            if (enc) {
                const b64 = String(enc).replace(/^a1/i, '').replace(/-/g, '+').replace(/_/g, '/');
                const decoded = Buffer.from(b64, 'base64').toString('utf8');
                if (/^https?:\/\//i.test(decoded)) return decoded.split('?')[0];
            }
        }
        const uddg = u.searchParams.get('uddg');
        if (uddg) return decodeURIComponent(uddg);
    } catch {
        /* keep original */
    }
    return link;
}

function toCandidate(classified, item, { keyword, location, mode, searchType, platform }) {
    const loc = String(location || '').trim();
    return {
        title: String(item.title || classified.handle || '').slice(0, 500),
        snippet: String(item.snippet || '').slice(0, 2000),
        resultUrl: classified.pageUrl,
        resultTypeHint: classified.resultTypeHint,
        sourceRecordId: `${platform}:${classified.handle}`.slice(0, 300),
        notes: [
            `source=${platform}`,
            `mode=${mode}`,
            `searchType=${searchType}`,
            `keyword=${keyword}`,
            loc ? `location=${loc}` : '',
            `evidenceUrl=${classified.pageUrl}`,
            `extractedAt=${new Date().toISOString()}`,
        ].filter(Boolean).join('; ').slice(0, 2000),
    };
}

export async function discoverFacebookPublic({ keyword, location, searchType = 'pages', maxResults = 20 }) {
    const queries = facebookPublicQueries({ keyword, location, searchType });
    const seen = new Set();
    const records = [];
    const errors = [];
    for (const query of queries) {
        const result = await searchWithPublicHtml({ query, maxResults });
        if (result.error && !result.items.length) errors.push(result.error);
        for (const item of result.items || []) {
            const classified = classifyFacebookUrl(unwrapPublicResultLink(item.link), searchType);
            if (!classified) continue;
            const key = classified.pageUrl.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            records.push(toCandidate(classified, item, {
                keyword, location, mode: 'public_search', searchType, platform: 'facebook',
            }));
            if (records.length >= maxResults) break;
        }
        if (records.length >= maxResults) break;
    }
    return { records, errors, queries };
}

export async function discoverInstagramPublic({ keyword, location, searchType = 'business_profiles', maxResults = 20 }) {
    const queries = instagramPublicQueries({ keyword, location, searchType });
    const seen = new Set();
    const records = [];
    const errors = [];
    for (const query of queries) {
        const result = await searchWithPublicHtml({ query, maxResults });
        if (result.error && !result.items.length) errors.push(result.error);
        for (const item of result.items || []) {
            const classified = classifyInstagramUrl(unwrapPublicResultLink(item.link), searchType);
            if (!classified) continue;
            const key = classified.pageUrl.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            records.push(toCandidate(classified, item, {
                keyword, location, mode: 'public_search', searchType, platform: 'instagram',
            }));
            if (records.length >= maxResults) break;
        }
        if (records.length >= maxResults) break;
    }
    return { records, errors, queries };
}
