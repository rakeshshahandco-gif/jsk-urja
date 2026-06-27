import { normalizeExtractorUrl, scoreExtractorConfidence } from './extractor.utils.js';
import { runManualUrlAdapter } from './adapters/manualUrlAdapter.js';
import {
    getActiveProviderName,
    getProviderLabel,
    getWebSearchConfigMessage,
    isProviderConfigured,
    listWebSearchProviderStatus,
    runWebSearchProvider,
    testWebSearchProvider,
} from './providers/searchProvider.factory.js';
import { mergeDuplicatePreviewRecords, normalizeExtractedRecord } from './companyNormalizer.service.js';
import { enrichRecordsWithDuplicates } from './duplicateChecker.service.js';
import { applyLeadScores } from './leadScoring.service.js';
import { getPortalAdapter, listPortalAdapterStatus, runPortalSearch } from './adapters/portalAdapter.factory.js';
import {
    getSocialPublicConfigMessage,
    isSocialPublicConfigured,
    searchSocialPublicPages,
} from './adapters/socialPublicPageAdapter.js';
import { getAiLayerStatus } from './extractorAi.service.js';
import { getGoogleKeysUiHints } from './googleCredentials.service.js';
import {
    getGoogleBusinessConfigMessage,
    isGoogleBusinessConfigured,
    searchGoogleBusiness,
    testGoogleBusinessConnection,
} from './adapters/googleBusinessAdapter.js';
import {
    getTradePortalSiteConfigMessage,
    isTradePortalSiteConfigured,
    searchTradePortalSite,
    testTradePortalSiteConnection,
    TRADE_PORTAL_SITES,
} from './adapters/tradePortalSiteAdapter.js';

export const KEYWORD_SOURCES = [
    { id: 'web_search', label: 'Web Search', phase: 2, configuredCheck: 'web_search', comingSoon: false },
    { id: 'indiamart', label: 'IndiaMART (Your Inbox)', phase: 4, configuredCheck: 'indiamart', comingSoon: false },
    { id: 'justdial', label: 'Justdial (Your Leads)', phase: 4, configuredCheck: 'justdial', comingSoon: false },
    { id: 'tradeindia', label: 'TradeIndia (Your Inquiries)', phase: 4, configuredCheck: 'tradeindia', comingSoon: false },
    { id: 'exportersindia', label: 'ExportersIndia (Listings)', phase: 4, configuredCheck: 'exportersindia', comingSoon: false },
    { id: 'alibaba', label: 'Alibaba (Listings)', phase: 4, configuredCheck: 'alibaba', comingSoon: false },
    { id: 'made_in_china', label: 'Made-in-China (Listings)', phase: 4, configuredCheck: 'made_in_china', comingSoon: false },
    { id: 'google_business', label: 'Google Business / Maps', phase: 4, configuredCheck: 'google_business', comingSoon: false },
    { id: 'social_public', label: 'Facebook / Instagram (Public Pages)', phase: 5, configuredCheck: 'social_public', comingSoon: false },
];

function buildQuery({ keyword, city, state, country }) {
    return [keyword, city, state, country].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
}

function isBlockedSocialUrl(link) {
    const lower = String(link || '').toLowerCase();
    return lower.includes('facebook.com') || lower.includes('instagram.com') || lower.includes('linkedin.com');
}

export function getProviderStatus(settings) {
    const providerName = getActiveProviderName();
    const configured = isProviderConfigured(providerName, settings);
    return {
        provider: providerName,
        providerLabel: getProviderLabel(providerName),
        configured,
        message: getWebSearchConfigMessage(settings),
        recommendedProvider: 'google_cse',
        webSearchProviders: listWebSearchProviderStatus(settings),
        dailySearchLimit: settings?.maxJobsPerDay ?? 10,
        timeoutMs: settings?.searchTimeoutMs ?? 15000,
        resultsPerSearch: settings?.maxResultsPerSearch ?? 20,
        enableLogs: settings?.enableSearchLogs ?? false,
        portalAdapters: listPortalAdapterStatus(settings),
        webhookBaseUrl: process.env.DATA_EXTRACTOR_WEBHOOK_BASE_URL || process.env.API_PUBLIC_URL || 'http://localhost:5000',
        socialPublicDiscovery: {
            configured: isSocialPublicConfigured(settings),
            message: getSocialPublicConfigMessage(settings),
        },
        aiLayer: getAiLayerStatus(settings),
        googleBusiness: {
            configured: isGoogleBusinessConfigured(settings),
            message: getGoogleBusinessConfigMessage(settings),
        },
        googleApiKeys: getGoogleKeysUiHints(settings),
        tradePortalSites: Object.keys(TRADE_PORTAL_SITES).map((id) => ({
            id,
            label: TRADE_PORTAL_SITES[id].label,
            configured: isTradePortalSiteConfigured(settings),
            message: getTradePortalSiteConfigMessage(id, settings),
        })),
    };
}

export function listKeywordSources(settings) {
    const webConfigured = isProviderConfigured(undefined, settings);
    return KEYWORD_SOURCES.map((src) => {
        if (src.id === 'web_search') {
            return {
                ...src,
                configured: webConfigured,
                message: getWebSearchConfigMessage(settings),
                provider: getActiveProviderName(),
                providerLabel: getProviderLabel(),
            };
        }
        if (src.id === 'social_public') {
            const configured = isSocialPublicConfigured(settings);
            return {
                ...src,
                configured,
                disabled: false,
                message: getSocialPublicConfigMessage(settings),
                description: 'Finds public Facebook Pages and Instagram business profiles via Web Search. Groups and personal profiles are rejected.',
            };
        }
        if (src.id === 'google_business') {
            const configured = isGoogleBusinessConfigured(settings);
            return {
                ...src,
                configured,
                disabled: false,
                message: getGoogleBusinessConfigMessage(settings),
                description: 'Google Places Text Search (or Web Search fallback for Maps URLs).',
            };
        }
        if (TRADE_PORTAL_SITES[src.id]) {
            const configured = isTradePortalSiteConfigured(settings);
            return {
                ...src,
                configured,
                disabled: false,
                message: getTradePortalSiteConfigMessage(src.id, settings),
                description: TRADE_PORTAL_SITES[src.id].description,
            };
        }
        const portal = getPortalAdapter(src.id);
        if (portal) {
            const baseUrl = process.env.DATA_EXTRACTOR_WEBHOOK_BASE_URL || process.env.API_PUBLIC_URL || 'http://localhost:5000';
            const configured = portal.needsCompanyId ? portal.isConfigured(settings) : portal.isConfigured();
            const entry = {
                ...src,
                configured: configured || src.id === 'justdial',
                disabled: false,
                message: portal.needsCompanyId ? portal.getConfigMessage(settings, baseUrl) : portal.getConfigMessage(),
                description: portal.description,
            };
            if (src.id === 'justdial' && settings?.sourceConnectors?.justdial?.webhookToken) {
                entry.webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/v1/data-extractor/webhooks/justdial/${settings.sourceConnectors.justdial.webhookToken}`;
            }
            return entry;
        }
        return {
            ...src,
            configured: false,
            disabled: true,
            message: `${src.label}: Coming soon (Phase ${src.phase}).`,
        };
    });
}

async function enrichTopResults(records, maxEnrich = 5) {
    const errors = [];
    const limit = Math.min(maxEnrich, records.length);
    for (let i = 0; i < limit; i++) {
        const url = records[i].website;
        if (!url) continue;
        try {
            const { records: enriched, errors: fetchErrors } = await runManualUrlAdapter([url]);
            errors.push(...fetchErrors);
            const e = enriched[0];
            if (!e) continue;
            records[i] = normalizeExtractedRecord({
                ...records[i],
                companyName: e.companyName || records[i].companyName,
                email: e.email || records[i].email,
                phone: e.phone || records[i].phone,
                mobile: e.mobile || records[i].mobile,
                businessDescription: e.businessDescription || records[i].businessDescription,
                address: e.address || records[i].address,
                city: e.city || records[i].city,
                stateProvince: e.stateProvince || records[i].stateProvince,
                country: e.country || records[i].country,
                keywords: [...new Set([...(records[i].keywords || []), ...(e.keywords || [])])],
                productCategories: [...new Set([...(records[i].productCategories || []), ...(e.productCategories || [])])],
                confidenceScore: scoreExtractorConfidence({ ...records[i], ...e }),
                rawExtractedData: {
                    ...(records[i].rawExtractedData || {}),
                    enriched: true,
                    ...(e.rawExtractedData || {}),
                },
            });
        } catch (err) {
            errors.push(`Enrich ${url}: ${err?.message || 'failed'}`);
        }
    }
    return { records, errors };
}

async function runWebSearch(input, settings, companyId) {
    if (!isProviderConfigured(undefined, settings)) {
        return {
            records: [],
            errors: [getWebSearchConfigMessage(settings)],
            metadata: { sourceStatus: 'not_configured', adapterId: 'web_search', previewOnly: true },
        };
    }

    const maxResults = Math.min(50, Math.max(1, Number(input.maxResults) || 10));
    const timeoutMs = settings?.searchTimeoutMs || 15000;
    const query = buildQuery(input);
    const errors = [];
    const seen = new Set();
    const rawRecords = [];

    const { items, error, providerName } = await runWebSearchProvider({ query, maxResults, timeoutMs, settings });
    if (error) errors.push(error);

    for (const item of items) {
        const link = String(item.link || '').trim();
        if (!link || isBlockedSocialUrl(link)) continue;
        const { domain } = normalizeExtractorUrl(link);
        if (domain && seen.has(domain)) continue;
        if (domain) seen.add(domain);

        const companyName = String(item.title || '').split('|')[0].split('-')[0].trim();
        const snippet = String(item.snippet || '').trim();
        rawRecords.push({
            companyName,
            website: link,
            normalizedDomain: domain,
            sourcePlatform: 'web_search',
            sourceUrl: link,
            sourceReference: query,
            businessDescription: snippet,
            keywords: input.keyword ? [String(input.keyword).trim()] : [],
            city: input.city || '',
            stateProvince: input.state || '',
            country: input.country || '',
            extractedAt: new Date(),
            confidenceScore: scoreExtractorConfidence({ companyName, website: link, businessDescription: snippet, city: input.city }),
            rawExtractedData: { searchQuery: query, searchSnippet: snippet, provider: providerName },
        });
        if (rawRecords.length >= maxResults) break;
    }

    const { records: enriched, errors: enrichErrors } = await enrichTopResults(rawRecords, 5);
    errors.push(...enrichErrors);

    let normalized = mergeDuplicatePreviewRecords(enriched.map(normalizeExtractedRecord));
    normalized = applyLeadScores(normalized);
    if (companyId) {
        normalized = await enrichRecordsWithDuplicates(companyId, normalized);
        normalized = applyLeadScores(normalized);
    }

    return {
        records: normalized,
        errors,
        metadata: {
            sourceStatus: normalized.length ? 'ok' : (errors.length ? 'error' : 'no_results'),
            adapterId: 'web_search',
            provider: providerName,
            query,
            resultCount: normalized.length,
            previewOnly: true,
        },
    };
}

export async function runKeywordSearch(input, settings, companyId = null) {
    const keyword = String(input.keyword || '').trim();
    if (!keyword) {
        return {
            records: [],
            errors: ['Keyword/Product is required'],
            metadata: { sourceStatus: 'validation_error' },
        };
    }

    const sourceId = String(input.sourceId || 'web_search').trim().toLowerCase();
    if (sourceId === 'web_search') {
        return runWebSearch(input, settings, companyId);
    }

    if (sourceId === 'social_public') {
        const { records, errors, metadata } = await searchSocialPublicPages(input, settings);
        let normalized = mergeDuplicatePreviewRecords(records.map(normalizeExtractedRecord));
        normalized = applyLeadScores(normalized);
        if (companyId) {
            normalized = await enrichRecordsWithDuplicates(companyId, normalized);
            normalized = applyLeadScores(normalized);
        }
        return { records: normalized, errors, metadata: { ...(metadata || {}), previewOnly: true } };
    }

    if (sourceId === 'google_business') {
        const { records, errors, metadata } = await searchGoogleBusiness(input, settings);
        let normalized = mergeDuplicatePreviewRecords(records.map(normalizeExtractedRecord));
        normalized = applyLeadScores(normalized);
        if (companyId) {
            normalized = await enrichRecordsWithDuplicates(companyId, normalized);
            normalized = applyLeadScores(normalized);
        }
        return { records: normalized, errors, metadata: { ...(metadata || {}), previewOnly: true } };
    }

    if (TRADE_PORTAL_SITES[sourceId]) {
        const { records, errors, metadata } = await searchTradePortalSite(sourceId, input, settings);
        let normalized = mergeDuplicatePreviewRecords(records.map(normalizeExtractedRecord));
        normalized = applyLeadScores(normalized);
        if (companyId) {
            normalized = await enrichRecordsWithDuplicates(companyId, normalized);
            normalized = applyLeadScores(normalized);
        }
        return { records: normalized, errors, metadata: { ...(metadata || {}), previewOnly: true } };
    }

    const portal = getPortalAdapter(sourceId);
    if (portal) {
        const { records, errors, metadata } = await runPortalSearch(sourceId, input, settings, companyId);
        let normalized = mergeDuplicatePreviewRecords(records.map(normalizeExtractedRecord));
        normalized = applyLeadScores(normalized);
        if (companyId) {
            normalized = await enrichRecordsWithDuplicates(companyId, normalized);
            normalized = applyLeadScores(normalized);
        }
        return { records: normalized, errors, metadata: { ...(metadata || {}), previewOnly: true } };
    }

    const src = KEYWORD_SOURCES.find((s) => s.id === sourceId);
    const label = src?.label || sourceId;
    return {
        records: [],
        errors: [`${label} is coming soon (Phase ${src?.phase || 4}).`],
        metadata: { sourceStatus: 'coming_soon', adapterId: sourceId },
    };
}
