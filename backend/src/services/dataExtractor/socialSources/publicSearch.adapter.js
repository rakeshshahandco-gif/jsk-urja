import { searchWithPublicHtml } from '../providers/publicHtmlSearchProvider.js';
import { classifyFacebookUrl, classifyInstagramUrl, facebookPublicQueries, instagramPublicQueries } from './classify.util.js';
import { classifyLinkedInUrl, classifyXUrl, linkedinPublicQueries, xPublicQueries, xPostToProfileEvidence } from './linkedinX.classify.util.js';
import {
    INSTAGRAM_PUBLIC_PROVIDER_PAGE,
    INSTAGRAM_STOP_REASONS,
    addSeenKey,
    isAlreadySeen,
    resolveInstagramStopReason,
} from './instagramBatch.util.js';

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

export async function discoverInstagramPublic({
    keyword,
    location,
    searchType = 'business_profiles',
    seenKeys,
    shouldStop,
} = {}) {
    const queries = instagramPublicQueries({ keyword, location, searchType });
    const seen = seenKeys instanceof Set ? seenKeys : new Set();
    const records = [];
    const errors = [];
    let alreadyKnown = 0;
    let stopReason = '';
    for (const query of queries) {
        if (shouldStop?.()) {
            stopReason = INSTAGRAM_STOP_REASONS.USER_STOP;
            break;
        }
        const result = await searchWithPublicHtml({ query, maxResults: INSTAGRAM_PUBLIC_PROVIDER_PAGE });
        if (result.error && !result.items.length) errors.push(result.error);
        if (result.statusCode === 'BLOCKED' || result.statusCode === 'RATE_LIMITED') {
            stopReason = resolveInstagramStopReason({ challenge: result.error || result.statusCode });
            if (!result.items.length) break;
        }
        let classifiedCount = 0;
        for (const item of result.items || []) {
            if (shouldStop?.()) {
                stopReason = INSTAGRAM_STOP_REASONS.USER_STOP;
                break;
            }
            const classified = classifyInstagramUrl(unwrapPublicResultLink(item.link), searchType);
            if (!classified) continue;
            classifiedCount += 1;
            if (classified.resultTypeHint !== 'instagram_profile') continue;
            const rec = toCandidate(classified, item, {
                keyword, location, mode: 'public_search', searchType, platform: 'instagram',
            });
            if (isAlreadySeen(seen, rec)) {
                alreadyKnown += 1;
                continue;
            }
            addSeenKey(seen, rec);
            records.push(rec);
        }
        if ((result.items || []).length && !classifiedCount) {
            errors.push(`Public search returned ${(result.items || []).length} results that were not Instagram profile URLs (provider: ${result.providerName || 'unknown'}). Direct Login remains the primary Instagram method.`);
        }
        if (stopReason) break;
    }
    if (!stopReason) {
        stopReason = resolveInstagramStopReason({ queriesExhausted: true });
    }
    return { records, errors, queries, alreadyKnown, stopReason };
}

export async function discoverLinkedInPublic({ keyword, location, searchType = 'companies', maxResults = 20 }) {
    const queries = linkedinPublicQueries({ keyword, location, searchType });
    const seen = new Set();
    const records = [];
    const errors = [];
    for (const query of queries) {
        const result = await searchWithPublicHtml({ query, maxResults });
        if (result.error && !result.items.length) errors.push(result.error);
        let classifiedCount = 0;
        for (const item of result.items || []) {
            const classified = classifyLinkedInUrl(unwrapPublicResultLink(item.link), searchType);
            if (!classified) continue;
            if (searchType === 'companies' && classified.urlKind !== 'company') continue;
            if (searchType === 'professionals' && classified.urlKind !== 'professional') continue;
            classifiedCount += 1;
            const key = classified.pageUrl.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            records.push(toCandidate(classified, item, {
                keyword, location, mode: 'public_search', searchType, platform: 'linkedin',
            }));
            if (records.length >= maxResults) break;
        }
        if ((result.items || []).length && !classifiedCount) {
            errors.push(`Public search returned ${(result.items || []).length} results that were not LinkedIn ${searchType} URLs. Direct Login remains the primary LinkedIn method.`);
        }
        if (records.length >= maxResults) break;
    }
    return { records, errors, queries };
}

export async function discoverXPublic({ keyword, location, searchType = 'profiles', maxResults = 20 }) {
    const queries = xPublicQueries({ keyword, location, searchType });
    const seen = new Set();
    const records = [];
    const errors = [];
    for (const query of queries) {
        const result = await searchWithPublicHtml({ query, maxResults });
        if (result.error && !result.items.length) errors.push(result.error);
        let classifiedCount = 0;
        for (const item of result.items || []) {
            let classified = classifyXUrl(unwrapPublicResultLink(item.link), searchType);
            if (!classified) continue;
            if (classified.urlKind === 'post') {
                const mapped = xPostToProfileEvidence(classified, item);
                if (!mapped) continue;
                classified = mapped;
            }
            classifiedCount += 1;
            const key = classified.pageUrl.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            const rec = toCandidate(classified, item, {
                keyword, location, mode: 'public_search', searchType, platform: 'x',
            });
            if (classified.evidenceUrl) {
                rec.notes = `${rec.notes}; postEvidence=${classified.evidenceUrl}`.slice(0, 2000);
            }
            records.push(rec);
            if (records.length >= maxResults) break;
        }
        if ((result.items || []).length && !classifiedCount) {
            errors.push(`Public search returned ${(result.items || []).length} results that were not X profile URLs. Direct Login remains the primary X method.`);
        }
        if (records.length >= maxResults) break;
    }
    return { records, errors, queries };
}
