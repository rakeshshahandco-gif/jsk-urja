import {
    getWebSearchConfigMessage,
    isProviderConfigured,
    runWebSearchProvider,
} from '../providers/searchProvider.factory.js';
import { normalizeExtractedRecord } from '../companyNormalizer.service.js';

const FACEBOOK_BLOCKED = [
    '/groups/', '/events/', '/watch/', '/marketplace/', '/login', '/share/',
    '/people/', '/help/', '/privacy/', '/policies/', '/photo.php', '/story.php',
    '/reel/', '/hashtag/', '/profile.php', '/l.php', '/plugins/', '/dialog/',
    '/sharer/', '/notes/', '/gaming/', '/ads/', '/business/help',
];

const INSTAGRAM_BLOCKED = [
    '/p/', '/reel/', '/reels/', '/tv/', '/stories/', '/explore/', '/accounts/',
    '/direct/', '/about/', '/legal/', '/developer/', '/nametag/', '/tags/',
];

const FACEBOOK_RESERVED = new Set([
    'pages', 'groups', 'events', 'watch', 'marketplace', 'login', 'help',
    'policies', 'privacy', 'business', 'ads', 'gaming', 'share', 'sharer',
    'profile.php', 'people', 'hashtag', 'reel', 'notes', 'l.php',
]);

function normalizeText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
}

function buildLocationQuery({ keyword, city, state, country }) {
    return [keyword, city, state, country].map((s) => normalizeText(s)).filter(Boolean).join(' ');
}

export function isSocialPublicConfigured(settings = null) {
    return isProviderConfigured(undefined, settings);
}

export function getSocialPublicConfigMessage(settings = null) {
    if (isSocialPublicConfigured(settings)) {
        return 'Public social page discovery uses your configured Web Search provider (Google CSE recommended) with site-restricted queries. Only public business page URLs are kept — groups and personal profiles are rejected.';
    }
    return `Public social discovery requires Web Search. ${getWebSearchConfigMessage(settings)}`;
}

/**
 * Accept only public Facebook Page or Instagram business profile URLs.
 * Rejects groups, reels, personal feeds, login walls, etc.
 */
export function classifyPublicSocialUrl(rawUrl) {
    let url;
    try {
        url = new URL(String(rawUrl || '').trim());
    } catch {
        return null;
    }

    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const path = url.pathname || '/';
    const lowerPath = path.toLowerCase();

    if (host === 'facebook.com' || host === 'm.facebook.com') {
        for (const blocked of FACEBOOK_BLOCKED) {
            if (lowerPath.includes(blocked)) return null;
        }
        const segments = path.split('/').filter(Boolean);
        if (!segments.length) return null;
        const handle = segments[0];
        if (FACEBOOK_RESERVED.has(handle.toLowerCase())) return null;
        if (!/^[A-Za-z0-9._-]{2,80}$/.test(handle)) return null;
        const canonical = `https://www.facebook.com/${handle}`;
        return { platform: 'facebook_page', handle, pageUrl: canonical };
    }

    if (host === 'instagram.com' || host === 'www.instagram.com') {
        for (const blocked of INSTAGRAM_BLOCKED) {
            if (lowerPath.includes(blocked)) return null;
        }
        const segments = path.split('/').filter(Boolean);
        if (segments.length !== 1) return null;
        const handle = segments[0];
        if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle)) return null;
        const canonical = `https://www.instagram.com/${handle}/`;
        return { platform: 'instagram_business', handle, pageUrl: canonical };
    }

    return null;
}

function deriveCompanyName(title, handle, platform) {
    const cleaned = normalizeText(String(title || '').split('|')[0].split('-')[0]);
    if (cleaned.length >= 2 && cleaned.length <= 120) return cleaned;
    const label = platform === 'facebook_page' ? 'Facebook Page' : 'Instagram';
    return `${handle} (${label})`;
}

function mapSocialSearchItem(item, input, classified, providerName) {
    const query = buildLocationQuery(input);
    const snippet = normalizeText(item.snippet);
    const companyName = deriveCompanyName(item.title, classified.handle, classified.platform);
    const socialLinks = classified.platform === 'facebook_page'
        ? { facebook: classified.pageUrl, instagram: '' }
        : { facebook: '', instagram: classified.pageUrl };

    return normalizeExtractedRecord({
        companyName,
        website: classified.pageUrl,
        normalizedDomain: '',
        sourcePlatform: classified.platform,
        sourceUrl: classified.pageUrl,
        sourceReference: `${classified.platform}:${classified.handle}`,
        businessDescription: snippet,
        keywords: input.keyword ? [normalizeText(input.keyword)] : [],
        city: normalizeText(input.city),
        stateProvince: normalizeText(input.state),
        country: normalizeText(input.country),
        socialLinks,
        extractedAt: new Date(),
        confidenceScore: 55,
        rawExtractedData: {
            adapter: 'social_public_page',
            handle: classified.handle,
            searchQuery: item.searchQuery || query,
            searchSnippet: snippet,
            provider: providerName,
            validation: 'public_page_only',
        },
    });
}

async function searchPlatformPages({ site, input, maxResults, timeoutMs, settings }) {
    const base = buildLocationQuery(input);
    const query = `site:${site} ${base}`.trim();
    const { items, error, providerName } = await runWebSearchProvider({
        query,
        maxResults,
        timeoutMs,
        settings,
    });
    return { items: items || [], error, providerName, query };
}

export async function testSocialPublicConnection(settings = null) {
    if (!isSocialPublicConfigured(settings)) {
        return { ok: false, message: getSocialPublicConfigMessage(settings) };
    }
    const { items, error, providerName } = await runWebSearchProvider({
        query: 'site:facebook.com manufacturer India page',
        maxResults: 3,
        timeoutMs: 15000,
        settings,
    });
    if (error) return { ok: false, message: error };

    let valid = 0;
    for (const item of items) {
        if (classifyPublicSocialUrl(item.link)) valid += 1;
    }

    return {
        ok: true,
        message: valid
            ? `Social discovery ready via ${providerName} — ${valid} public page URL(s) validated in sample`
            : `Web Search connected (${providerName}) but no valid public page URLs in sample — try a specific brand keyword`,
        sampleCount: valid,
    };
}

export async function searchSocialPublicPages(input, settings) {
    if (!isSocialPublicConfigured(settings)) {
        return {
            records: [],
            errors: [getSocialPublicConfigMessage(settings)],
            metadata: { sourceStatus: 'not_configured', adapterId: 'social_public' },
        };
    }

    const maxResults = Math.min(30, Math.max(1, Number(input.maxResults) || 10));
    const timeoutMs = settings?.searchTimeoutMs || 15000;
    const perSite = Math.ceil(maxResults / 2);
    const errors = [];
    const seen = new Set();
    const records = [];
    const audit = {
        rejectedUrls: [],
        queries: [],
        platforms: { facebook_page: 0, instagram_business: 0 },
    };

    const searches = [
        { site: 'facebook.com', label: 'facebook' },
        { site: 'instagram.com', label: 'instagram' },
    ];

    for (const { site } of searches) {
        const { items, error, providerName, query } = await searchPlatformPages({
            site,
            input,
            maxResults: perSite,
            timeoutMs,
            settings,
        });
        audit.queries.push(query);
        if (error) errors.push(error);

        for (const item of items) {
            const link = String(item.link || '').trim();
            const classified = classifyPublicSocialUrl(link);
            if (!classified) {
                if (link && (link.includes('facebook.com') || link.includes('instagram.com'))) {
                    audit.rejectedUrls.push(link.slice(0, 200));
                }
                continue;
            }

            const dedupeKey = `${classified.platform}:${classified.handle.toLowerCase()}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);

            records.push(mapSocialSearchItem(
                { ...item, searchQuery: query },
                input,
                classified,
                providerName,
            ));
            audit.platforms[classified.platform] = (audit.platforms[classified.platform] || 0) + 1;

            if (records.length >= maxResults) break;
        }
        if (records.length >= maxResults) break;
    }

    if (settings?.enableSearchLogs) {
        console.info('[data-extractor] social public search audit', {
            resultCount: records.length,
            rejectedCount: audit.rejectedUrls.length,
            queries: audit.queries,
            platforms: audit.platforms,
        });
    }

    return {
        records,
        errors,
        metadata: {
            sourceStatus: records.length ? 'ok' : (errors.length ? 'error' : 'no_results'),
            adapterId: 'social_public',
            apiType: 'web_search_site_restricted',
            note: 'Public Facebook Pages and Instagram business profiles only. Groups, reels, and personal profiles are blocked.',
            resultCount: records.length,
            rejectedUrlCount: audit.rejectedUrls.length,
            audit,
            previewOnly: true,
        },
    };
}
