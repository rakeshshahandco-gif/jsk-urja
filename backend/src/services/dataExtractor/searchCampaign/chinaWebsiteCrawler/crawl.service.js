/**
 * Controlled public website crawl for China discovery destinations.
 * Reuses enrichment storage. Does not bypass login/CAPTCHA. No new collection.
 */
import { assertResolvedPublicUrl } from '../../discovery/ssrfGuard.js';
import { normalizeDomain } from '../rawCaptureEnrichment/parse.util.js';
import { parsePageBundle } from '../rawCaptureEnrichment/parse.util.js';
import {
    CRAWL_STATUSES,
    DESTINATION_TYPES,
    chinaCrawlDelayMs,
    chinaCrawlMaxPages,
} from './constants.js';
import { classifyDestinationType, isSearchEngineHost } from './destinationType.util.js';
import { extractChinaPage, hasChineseOriginal, isLikelyChineseBusinessText } from './chinaPageExtract.util.js';
import { delayMs, fetchPublicHtml } from './safeFetch.util.js';
import { containsCjk } from '../simpleLeadSearch/chinaBilingual.util.js';

function rootDomainOf(url) {
    try {
        return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        return normalizeDomain(url);
    }
}

/**
 * Follow search-engine redirect URLs to the public destination, SSRF-checked each hop.
 */
export async function resolveDestinationUrl(rawUrl) {
    const original = String(rawUrl || '').trim();
    const destinationType0 = classifyDestinationType(original);
    let current = original;
    try {
        current = await assertResolvedPublicUrl(original);
    } catch (err) {
        return {
            ok: false,
            error: err?.message || 'Unsafe URL',
            originalUrl: original,
            finalUrl: original,
            destinationType: destinationType0,
            rootDomain: rootDomainOf(original),
            hops: 0,
        };
    }

    if (isSearchEngineHost(current)) {
        const fetched = await fetchPublicHtml(current);
        if (fetched.ok || fetched.finalUrl) {
            current = fetched.finalUrl || current;
        } else if (fetched.error) {
            return {
                ok: false,
                error: fetched.error,
                blocked: fetched.blocked,
                originalUrl: original,
                finalUrl: current,
                destinationType: destinationType0,
                rootDomain: rootDomainOf(current),
                hops: 1,
            };
        }
    }

    const destinationType = classifyDestinationType(current);
    return {
        ok: true,
        error: '',
        originalUrl: original,
        finalUrl: current,
        destinationType,
        rootDomain: rootDomainOf(current),
        hops: current === original ? 0 : 1,
        discoveredThroughKept: true,
    };
}

function mergeChina(acc, pageExtract) {
    if (!acc.companyNameOriginal && pageExtract.companyNameOriginal) {
        acc.companyNameOriginal = pageExtract.companyNameOriginal;
    }
    if (!acc.publicWeChat && pageExtract.wechat) acc.publicWeChat = pageExtract.wechat;
    if (!acc.phone && pageExtract.phone) acc.phone = pageExtract.phone;
    if (!acc.email && pageExtract.email) acc.email = pageExtract.email;
    if (!acc.contactPersonOriginal && pageExtract.person) acc.contactPersonOriginal = pageExtract.person;
    if (!acc.addressOriginal && pageExtract.address) acc.addressOriginal = pageExtract.address;
    if (!acc.manufacturerEvidence && pageExtract.manufacturerEvidence) {
        acc.manufacturerEvidence = pageExtract.manufacturerEvidence;
    }
    if (pageExtract.evidenceOriginal && pageExtract.evidenceOriginal.length > (acc.evidenceOriginal || '').length) {
        acc.evidenceOriginal = pageExtract.evidenceOriginal;
    }
    if (pageExtract.hasChineseOriginal) acc.hasChineseOriginal = true;
    return acc;
}

/**
 * Crawl homepage + prioritized internal pages for one company website.
 */
export async function crawlCompanyWebsite(seedUrl, opts = {}) {
    const maxPages = opts.maxPages || chinaCrawlMaxPages();
    const delay = opts.delayMs ?? chinaCrawlDelayMs();
    const pagesVisited = [];
    const internalPages = [];
    const errors = [];
    let crawlStatus = CRAWL_STATUSES.CRAWLING;

    const resolved = await resolveDestinationUrl(seedUrl);
    if (!resolved.ok) {
        crawlStatus = resolved.blocked ? CRAWL_STATUSES.CRAWL_BLOCKED : CRAWL_STATUSES.CRAWL_FAILED;
        return {
            ok: false,
            crawlStatus,
            error: resolved.error,
            destinationType: resolved.destinationType,
            destinationDomain: resolved.rootDomain,
            finalUrl: resolved.finalUrl,
            pagesVisited,
            internalPagesCrawled: 0,
            data: null,
        };
    }

    if (resolved.destinationType === DESTINATION_TYPES.SEARCH_ENGINE_RESULT) {
        return {
            ok: false,
            crawlStatus: CRAWL_STATUSES.CRAWL_FAILED,
            error: 'Destination still a search-engine URL',
            destinationType: resolved.destinationType,
            destinationDomain: resolved.rootDomain,
            finalUrl: resolved.finalUrl,
            pagesVisited,
            internalPagesCrawled: 0,
            data: null,
        };
    }

    if (
        resolved.destinationType === DESTINATION_TYPES.MARKETPLACE_LISTING
        || resolved.destinationType === DESTINATION_TYPES.COMPANY_PROFILE_DIRECTORY
        || resolved.destinationType === DESTINATION_TYPES.SOCIAL_OTHER
    ) {
        return {
            ok: true,
            crawlStatus: CRAWL_STATUSES.CRAWLED,
            skippedSiteCrawl: true,
            error: '',
            destinationType: resolved.destinationType,
            destinationDomain: resolved.rootDomain,
            finalUrl: resolved.finalUrl,
            pagesVisited: [resolved.finalUrl],
            internalPagesCrawled: 0,
            data: {
                websiteUrl: resolved.finalUrl,
                canonicalDomain: resolved.rootDomain,
                destinationType: resolved.destinationType,
                hasChineseOriginal: false,
            },
        };
    }

    const domain = resolved.rootDomain;
    const homepage = (() => {
        try {
            const u = new URL(resolved.finalUrl);
            return `${u.protocol}//${u.host}/`;
        } catch {
            return resolved.finalUrl;
        }
    })();

    const queue = [homepage];
    if (resolved.finalUrl.replace(/\/$/, '') !== homepage.replace(/\/$/, '')) {
        queue.push(resolved.finalUrl);
    }

    let acc = {
        websiteUrl: homepage,
        canonicalDomain: domain,
        destinationType: resolved.destinationType,
        companyNameOriginal: '',
        publicWeChat: '',
        phone: '',
        email: '',
        contactPersonOriginal: '',
        addressOriginal: '',
        manufacturerEvidence: '',
        evidenceOriginal: '',
        hasChineseOriginal: false,
        parsed: null,
    };

    const seen = new Set();
    while (queue.length && pagesVisited.length < maxPages) {
        const next = queue.shift();
        const key = String(next || '').replace(/\/$/, '').toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (pagesVisited.length) await delayMs(delay);

        const fetched = await fetchPublicHtml(next);
        if (!fetched.ok) {
            if (fetched.blocked) {
                errors.push(`${next}: blocked`);
                if (!pagesVisited.length) crawlStatus = CRAWL_STATUSES.CRAWL_BLOCKED;
            } else {
                errors.push(`${next}: ${fetched.error}`);
            }
            continue;
        }
        pagesVisited.push(fetched.finalUrl || next);
        if (pagesVisited.length > 1) internalPages.push(fetched.finalUrl || next);

        const parsed = parsePageBundle(fetched.html, fetched.finalUrl || next);
        if (!acc.parsed) acc.parsed = parsed;
        else {
            acc.parsed.emails = [...(acc.parsed.emails || []), ...(parsed.emails || [])];
            acc.parsed.phones = [...(acc.parsed.phones || []), ...(parsed.phones || [])];
            acc.parsed.addresses = [...(acc.parsed.addresses || []), ...(parsed.addresses || [])];
            acc.parsed.productsServices = [...new Set([
                ...(acc.parsed.productsServices || []),
                ...(parsed.productsServices || []),
            ])].slice(0, 30);
            if (!acc.parsed.companyName && parsed.companyName) acc.parsed.companyName = parsed.companyName;
        }

        const china = extractChinaPage(fetched.html, fetched.finalUrl || next);
        acc = mergeChina(acc, china);

        for (const link of china.candidateLinks || []) {
            if (rootDomainOf(link.url) !== domain) continue;
            const k = link.url.replace(/\/$/, '').toLowerCase();
            if (!seen.has(k) && queue.length + pagesVisited.length < maxPages + 4) {
                queue.push(link.url);
            }
        }
    }

    if (!pagesVisited.length) {
        crawlStatus = crawlStatus === CRAWL_STATUSES.CRAWL_BLOCKED
            ? CRAWL_STATUSES.CRAWL_BLOCKED
            : CRAWL_STATUSES.CRAWL_FAILED;
        return {
            ok: false,
            crawlStatus,
            error: errors[0] || 'No pages fetched',
            destinationType: resolved.destinationType,
            destinationDomain: domain,
            finalUrl: resolved.finalUrl,
            pagesVisited,
            internalPagesCrawled: 0,
            data: null,
        };
    }

    const blob = `${acc.companyNameOriginal} ${acc.evidenceOriginal} ${acc.addressOriginal}`;
    acc.hasChineseOriginal = acc.hasChineseOriginal || isLikelyChineseBusinessText(blob) || hasChineseOriginal(acc.companyNameOriginal);
    crawlStatus = acc.companyNameOriginal || acc.phone || acc.email || acc.publicWeChat || acc.hasChineseOriginal
        ? CRAWL_STATUSES.EXTRACTED
        : CRAWL_STATUSES.CRAWLED;

    return {
        ok: true,
        crawlStatus,
        error: errors.join('; '),
        destinationType: resolved.destinationType,
        destinationDomain: domain,
        finalUrl: resolved.finalUrl,
        pagesVisited,
        internalPagesCrawled: internalPages.length,
        data: acc,
    };
}

export { CRAWL_STATUSES, DESTINATION_TYPES };
