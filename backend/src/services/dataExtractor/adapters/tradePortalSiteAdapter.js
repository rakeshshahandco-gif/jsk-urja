import {
    getWebSearchConfigMessage,
    isProviderConfigured,
    runWebSearchProvider,
} from '../providers/searchProvider.factory.js';
import { normalizeExtractedRecord } from '../companyNormalizer.service.js';
import { scoreExtractorConfidence } from '../extractor.utils.js';

export const TRADE_PORTAL_SITES = {
    exportersindia: {
        id: 'exportersindia',
        label: 'ExportersIndia',
        site: 'exportersindia.com',
        platform: 'exportersindia',
        blockedPaths: ['/login', '/signup', '/cart', '/search?', '/news/'],
        description: 'Public company listings on ExportersIndia via Web Search (no seller inbox API).',
    },
    alibaba: {
        id: 'alibaba',
        label: 'Alibaba',
        site: 'alibaba.com',
        platform: 'alibaba',
        blockedPaths: ['/login', '/cart', '/trade/search', '/help/', '/member/'],
        description: 'Public supplier/company pages on Alibaba via Web Search — pair with AI for Chinese translation.',
    },
    made_in_china: {
        id: 'made_in_china',
        label: 'Made-in-China',
        site: 'made-in-china.com',
        platform: 'made_in_china',
        blockedPaths: ['/login', '/member/', '/help/', '/video/'],
        description: 'Public supplier listings on Made-in-China via Web Search.',
    },
};

function normalizeText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
}

function buildLocationQuery(input) {
    return [input.keyword, input.city, input.state, input.country].map((s) => normalizeText(s)).filter(Boolean).join(' ');
}

export function isTradePortalSiteConfigured(settings = null) {
    return isProviderConfigured(undefined, settings);
}

export function getTradePortalSiteConfig(sourceId) {
    return TRADE_PORTAL_SITES[String(sourceId || '').trim().toLowerCase()] || null;
}

export function getTradePortalSiteConfigMessage(sourceId, settings = null) {
    const cfg = getTradePortalSiteConfig(sourceId);
    if (!cfg) return `Unknown trade portal: ${sourceId}`;
    if (isTradePortalSiteConfigured(settings)) {
        return `${cfg.label} discovery uses Web Search (site:${cfg.site}). Enable AI for Chinese listing translation.`;
    }
    return `${cfg.label} requires Web Search. ${getWebSearchConfigMessage(settings)}`;
}

export function classifyTradePortalUrl(rawUrl, cfg) {
    let url;
    try {
        url = new URL(String(rawUrl || '').trim());
    } catch {
        return null;
    }

    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const site = cfg.site.replace(/^www\./, '');
    if (!host.endsWith(site)) return null;

    const lowerPath = (url.pathname || '/').toLowerCase();
    for (const blocked of cfg.blockedPaths) {
        if (lowerPath.includes(blocked.toLowerCase())) return null;
    }

    if (lowerPath === '/' || lowerPath.length < 3) return null;

    return { pageUrl: url.toString().split('#')[0], host };
}

function mapTradePortalItem(item, input, cfg, providerName, query) {
    const snippet = normalizeText(item.snippet);
    const title = normalizeText(item.title);
    const companyName = title.split('|')[0].split('-')[0].trim() || cfg.label;
    const link = normalizeText(item.link);
    const keyword = normalizeText(input.keyword);

    const socialLinks = cfg.platform === 'alibaba' ? { alibaba: link } : {};

    return normalizeExtractedRecord({
        companyName,
        website: link,
        normalizedDomain: cfg.site,
        sourcePlatform: cfg.platform,
        sourceUrl: link,
        sourceReference: query,
        businessDescription: snippet,
        keywords: keyword ? [keyword] : [],
        city: normalizeText(input.city),
        stateProvince: normalizeText(input.state),
        country: normalizeText(input.country),
        socialLinks,
        extractedAt: new Date(),
        confidenceScore: scoreExtractorConfidence({ companyName, website: link, businessDescription: snippet }),
        rawExtractedData: {
            adapter: 'trade_portal_site_search',
            portal: cfg.id,
            searchQuery: query,
            provider: providerName,
        },
    });
}

export async function testTradePortalSiteConnection(sourceId, settings = null) {
    const cfg = getTradePortalSiteConfig(sourceId);
    if (!cfg) return { ok: false, message: `Unknown portal: ${sourceId}` };
    if (!isTradePortalSiteConfigured(settings)) {
        return { ok: false, message: getTradePortalSiteConfigMessage(sourceId, settings) };
    }
    const query = `site:${cfg.site} manufacturer India`;
    const { items, error, providerName } = await runWebSearchProvider({
        query,
        maxResults: 3,
        timeoutMs: 15000,
        settings,
    });
    if (error) return { ok: false, message: error };
    let valid = 0;
    for (const item of items) {
        if (classifyTradePortalUrl(item.link, cfg)) valid += 1;
    }
    return {
        ok: true,
        message: valid
            ? `${cfg.label} ready via ${providerName} — ${valid} listing URL(s) validated`
            : `Web Search connected but no valid ${cfg.label} URLs in sample`,
        sampleCount: valid,
    };
}

export async function searchTradePortalSite(sourceId, input, settings) {
    const cfg = getTradePortalSiteConfig(sourceId);
    if (!cfg) {
        return {
            records: [],
            errors: [`Unknown trade portal: ${sourceId}`],
            metadata: { sourceStatus: 'unknown', adapterId: sourceId },
        };
    }
    if (!isTradePortalSiteConfigured(settings)) {
        return {
            records: [],
            errors: [getTradePortalSiteConfigMessage(sourceId, settings)],
            metadata: { sourceStatus: 'not_configured', adapterId: sourceId },
        };
    }

    const maxResults = Math.min(20, Math.max(1, Number(input.maxResults) || 10));
    const timeoutMs = settings?.searchTimeoutMs || 15000;
    const query = `site:${cfg.site} ${buildLocationQuery(input)}`.trim();

    const { items, error, providerName } = await runWebSearchProvider({
        query,
        maxResults: maxResults + 5,
        timeoutMs,
        settings,
    });

    const errors = error ? [error] : [];
    const seen = new Set();
    const records = [];

    for (const item of items) {
        const link = String(item.link || '').trim();
        const classified = classifyTradePortalUrl(link, cfg);
        if (!classified) continue;
        const key = classified.pageUrl.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        records.push(mapTradePortalItem(item, input, cfg, providerName, query));
        if (records.length >= maxResults) break;
    }

    return {
        records,
        errors,
        metadata: {
            sourceStatus: records.length ? 'ok' : (errors.length ? 'error' : 'no_results'),
            adapterId: sourceId,
            apiType: 'web_search_site_restricted',
            note: cfg.description,
            query,
            resultCount: records.length,
            previewOnly: true,
        },
    };
}
