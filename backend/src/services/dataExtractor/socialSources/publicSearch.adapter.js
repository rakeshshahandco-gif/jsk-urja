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
import { FACEBOOK_PUBLIC_PROVIDER_PAGE } from './unlimitedExtraction.util.js';
import {
    FACEBOOK_PUBLIC_PAGE_DELAY_MS,
    FACEBOOK_PUBLIC_PAGE_WINDOW,
    FACEBOOK_PUBLIC_QUERY_DELAY_MS,
    FACEBOOK_PUBLIC_WINDOW_DELAY_MS,
    facebookPublicPagesResumePoint,
    isFacebookPublicPagesSearch,
    mergeFacebookPublicPagesCheckpoint,
    publicContactHints,
    summarizeFacebookPublicRun,
} from './facebookPublicPages.util.js';

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
            item.category ? `category=${String(item.category).slice(0, 120)}` : '',
            item.phone ? `phone=${item.phone}` : '',
            item.email ? `email=${item.email}` : '',
            item.website ? `website=${item.website}` : '',
            `extractedAt=${new Date().toISOString()}`,
        ].filter(Boolean).join('; ').slice(0, 2000),
    };
}

export async function discoverFacebookPublic({
    keyword,
    location,
    searchType = 'pages',
    maxResults,
    searchImpl,
    shouldStop,
    checkpoint,
    onCheckpoint,
    queries: queryOverride,
} = {}) {
    const queries = Array.isArray(queryOverride) && queryOverride.length
        ? queryOverride
        : facebookPublicQueries({ keyword, location, searchType });
    const pagesMode = isFacebookPublicPagesSearch(searchType);
    const resume = pagesMode ? facebookPublicPagesResumePoint(checkpoint) : facebookPublicPagesResumePoint();
    const seen = new Set(resume.seenKeys);
    const records = [];
    const errors = [];
    let stopReason = '';
    let sourceResultsFound = Number(checkpoint?.sourceResultsFound || 0);
    let pagesFetched = 0;
    let currentProvider = resume.currentProvider;
    let currentResultPage = Math.max(0, Number(checkpoint?.lastSuccessfulPage || 0));
    let lastSuccessfulPage = currentResultPage;
    let nextPage = Math.max(1, Number(checkpoint?.nextPage || 1));
    let currentQuery = resume.currentQuery;
    let queryIndex = resume.queryIndex;
    let lastPageAdvanceAt = checkpoint?.updatedAt || null;
    const checkpoints = [];
    const searcher = typeof searchImpl === 'function' ? searchImpl : searchWithPublicHtml;
    const providerPage = Math.min(
        FACEBOOK_PUBLIC_PROVIDER_PAGE,
        Math.max(1, Number(maxResults) > 0 && Number(maxResults) < FACEBOOK_PUBLIC_PROVIDER_PAGE
            ? Number(maxResults)
            : FACEBOOK_PUBLIC_PROVIDER_PAGE),
    );

    const persist = async (status, reason = '') => {
        const next = mergeFacebookPublicPagesCheckpoint(checkpoint, {
            currentQuery,
            queryIndex,
            queryTotal: queries.length,
            currentProvider,
            lastSuccessfulPage,
            nextPage,
            seenKeys: [...seen],
            sourceResultsFound,
            uniqueBusinesses: records.length,
            stopReason: reason || stopReason,
            status,
        });
        checkpoints.push(next);
        if (typeof onCheckpoint === 'function') {
            await onCheckpoint(next);
        }
        return next;
    };

    const absorbItems = (items) => {
        let accepted = 0;
        for (const item of items || []) {
            const classified = classifyFacebookUrl(unwrapPublicResultLink(item.link), searchType);
            if (!classified) continue;
            if (pagesMode && classified.resultTypeHint === 'facebook_group') continue;
            const key = classified.pageUrl.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            const hints = publicContactHints(`${item.title || ''} ${item.snippet || ''}`);
            records.push(toCandidate(classified, {
                ...item,
                ...hints,
            }, {
                keyword, location, mode: 'public_search', searchType, platform: 'facebook',
            }));
            accepted += 1;
        }
        return accepted;
    };

    if (!pagesMode) {
        for (const query of queries) {
            if (shouldStop?.()) {
                stopReason = 'user_stop';
                break;
            }
            queryIndex += 1;
            currentQuery = query;
            const result = await searcher({
                query,
                maxResults: providerPage,
                maxPages: 1,
            });
            currentProvider = result.providerName || currentProvider;
            currentResultPage = Number(result.pagesFetched || 1);
            lastSuccessfulPage = currentResultPage;
            nextPage = currentResultPage + 1;
            pagesFetched += Number(result.pagesFetched || 1);
            sourceResultsFound += (result.items || []).length;
            if (result.error && !result.items.length) errors.push(result.error);
            if (result.statusCode === 'BLOCKED' || result.statusCode === 'RATE_LIMITED') {
                errors.push(result.error || result.statusCode);
                stopReason = 'source_safety_pause';
                if (!result.items.length) break;
            }
            absorbItems(result.items);
            if (stopReason === 'user_stop' || stopReason === 'source_safety_pause') break;
        }
        if (!stopReason) stopReason = 'source_exhausted';
    } else {
        let startQueryPos = 0;
        let pageIndex = 0;
        if (resume.currentQuery) {
            const idx = queries.indexOf(resume.currentQuery);
            startQueryPos = idx >= 0 ? idx : Math.max(0, resume.queryIndex - 1);
            pageIndex = resume.startPageIndex;
        }

        for (let qi = startQueryPos; qi < queries.length; qi += 1) {
            if (shouldStop?.()) {
                stopReason = 'user_stop';
                break;
            }
            const query = queries[qi];
            queryIndex = qi + 1;
            currentQuery = query;
            if (qi !== startQueryPos) pageIndex = 0;
            if (qi > startQueryPos && FACEBOOK_PUBLIC_QUERY_DELAY_MS > 0 && searcher === searchWithPublicHtml) {
                await new Promise((r) => setTimeout(r, FACEBOOK_PUBLIC_QUERY_DELAY_MS));
            }

            let queryExhausted = false;
            while (!queryExhausted && !stopReason) {
                const windowStart = pageIndex;
                for (let w = 0; w < FACEBOOK_PUBLIC_PAGE_WINDOW; w += 1) {
                    if (shouldStop?.()) {
                        stopReason = 'user_stop';
                        break;
                    }
                    const result = await searcher({
                        query,
                        maxResults: providerPage,
                        maxPages: 1,
                        startPage: pageIndex,
                        pageDelayMs: FACEBOOK_PUBLIC_PAGE_DELAY_MS,
                        providerHint: currentProvider,
                    });
                    currentProvider = result.providerName || currentProvider;
                    pagesFetched += Number(result.pagesFetched || 1);
                    sourceResultsFound += (result.items || []).length;
                    if (result.error && !result.items.length) errors.push(result.error);
                    if (result.statusCode === 'BLOCKED' || result.statusCode === 'RATE_LIMITED') {
                        errors.push(result.error || result.statusCode);
                        stopReason = 'source_safety_pause';
                        break;
                    }
                    if (!(result.items || []).length) {
                        queryExhausted = true;
                        break;
                    }
                    absorbItems(result.items);
                    lastSuccessfulPage = pageIndex + 1;
                    currentResultPage = lastSuccessfulPage;
                    nextPage = lastSuccessfulPage + 1;
                    lastPageAdvanceAt = new Date().toISOString();
                    pageIndex += 1;
                    if (stopReason === 'user_stop') break;
                }
                await persist(
                    stopReason === 'user_stop' || stopReason === 'source_safety_pause' ? 'paused' : 'window_complete',
                    stopReason,
                );
                if (stopReason === 'user_stop' || stopReason === 'source_safety_pause') break;
                if (queryExhausted) break;
                if (pageIndex === windowStart) {
                    queryExhausted = true;
                    break;
                }
                if (searcher === searchWithPublicHtml && FACEBOOK_PUBLIC_WINDOW_DELAY_MS > 0) {
                    await new Promise((r) => setTimeout(r, FACEBOOK_PUBLIC_WINDOW_DELAY_MS));
                }
            }
            if (stopReason === 'user_stop' || stopReason === 'source_safety_pause') break;
        }
        if (!stopReason) stopReason = 'source_exhausted';
        await persist(stopReason === 'source_exhausted' ? 'exhausted' : 'paused', stopReason);
    }

    const facebookPublicRun = summarizeFacebookPublicRun({
        sourceResultsFound,
        uniqueBusinesses: records.length,
        currentQuery,
        queryIndex,
        queryTotal: queries.length,
        currentProvider,
        currentResultPage,
        lastSuccessfulPage,
        nextPage,
        lastPageAdvanceAt,
        pagesFetched,
        stopReason,
        queries,
    });
    return {
        records,
        errors,
        queries,
        stopReason,
        facebookPublicRun,
        checkpoint: checkpoints[checkpoints.length - 1] || null,
    };
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
