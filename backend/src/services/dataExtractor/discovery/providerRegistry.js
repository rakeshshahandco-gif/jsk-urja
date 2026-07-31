import { PROVIDER_TYPES } from './providerTypes.js';
import { isSerpApiConfigured } from '../providers/serpapiProvider.js';
import { isBraveConfigured, testBraveConnection } from '../providers/braveSearchProvider.js';
import { isGooglePlacesConfigured } from '../googleCredentials.service.js';
import { isPlacesEnrichmentEnabled } from '../placesEnrichment.service.js';
import { testWebSearchProvider } from '../providers/searchProvider.factory.js';
import { testGoogleBusinessConnection } from '../adapters/googleBusinessAdapter.js';
import { getIndiamartDiscoveryConfig, testIndiamartAvailability } from './indiamartDiscovery.service.js';

const FUTURE = [
    ['tradeindia', 'TradeIndia', PROVIDER_TYPES.FUTURE_PROVIDER],
    ['justdial', 'Justdial', PROVIDER_TYPES.FUTURE_PROVIDER],
    ['exportersindia', 'ExportersIndia', PROVIDER_TYPES.FUTURE_PROVIDER],
    ['linkedin_company', 'LinkedIn Company Pages', PROVIDER_TYPES.FUTURE_PROVIDER],
    ['youtube_business', 'YouTube Business Channels', PROVIDER_TYPES.FUTURE_PROVIDER],
    ['apify', 'Apify', PROVIDER_TYPES.FUTURE_PROVIDER],
    ['bright_data', 'Bright Data', PROVIDER_TYPES.FUTURE_PROVIDER],
];

function usageNA() {
    return { usageUsed: 'Not available from provider', usageRemaining: 'Not available from provider' };
}

function discoveryCfg(settings) {
    return settings?.sourceConnectors?.discovery || {};
}

function freeFirst(settings) {
    const d = discoveryCfg(settings);
    return d.freeFirstEnabled !== false;
}

export const DISCOVERY_PROVIDERS = [
    {
        providerId: 'brave',
        providerName: 'Brave Search',
        providerType: PROVIDER_TYPES.SEARCH_PROVIDER,
        categoryLabel: 'Free-first search',
        priority: 1,
        supportsPagination: true,
        supportsResume: true,
        supportsLocation: true,
        supportsKeyword: true,
        supportsBusinessProfile: false,
        rateLimitType: 'api_key',
        isConfigured: (s) => isBraveConfigured(s),
        isEnabled: (s) => discoveryCfg(s).braveEnabled !== false && isBraveConfigured(s),
        executable: true,
        async healthCheck(settings) {
            return testBraveConnection(settings);
        },
        usageDetails: (s) => {
            const b = s?.sourceConnectors?.brave || {};
            return {
                usageUsed: b.usageUsed != null ? String(b.usageUsed) : '0',
                usageRemaining: b.monthlySafetyLimit != null
                    ? String(Math.max(0, Number(b.monthlySafetyLimit) - Number(b.usageUsed || 0)))
                    : 'Not available from provider',
            };
        },
    },
    {
        providerId: 'indiamart',
        providerName: 'IndiaMART',
        providerType: PROVIDER_TYPES.BUSINESS_DIRECTORY,
        categoryLabel: 'Business directory (manual/import + optional Brave site:)',
        priority: 2,
        supportsPagination: true,
        supportsResume: true,
        supportsLocation: true,
        supportsKeyword: true,
        supportsBusinessProfile: true,
        rateLimitType: 'request_delay',
        isConfigured: () => true,
        isEnabled: (s) => getIndiamartDiscoveryConfig(s).enabled,
        executable: true,
        async healthCheck(settings) {
            return testIndiamartAvailability(settings);
        },
        usageDetails: usageNA,
    },
    {
        providerId: 'manual_url',
        providerName: 'Manual URL Import',
        providerType: PROVIDER_TYPES.MANUAL_IMPORT,
        categoryLabel: 'Free/manual source',
        priority: 3,
        supportsPagination: false,
        supportsResume: false,
        supportsLocation: false,
        supportsKeyword: false,
        supportsBusinessProfile: true,
        rateLimitType: 'none',
        isConfigured: () => true,
        isEnabled: () => true,
        executable: true,
        async healthCheck() {
            return { ok: true, status: 'CONNECTED', connectionStatus: 'CONNECTED', message: 'Manual URL import ready' };
        },
        usageDetails: usageNA,
    },
    {
        providerId: 'excel_import',
        providerName: 'Excel / CSV Import',
        providerType: PROVIDER_TYPES.FILE_IMPORT,
        categoryLabel: 'Free/manual source',
        priority: 4,
        supportsPagination: false,
        supportsResume: false,
        supportsLocation: false,
        supportsKeyword: false,
        supportsBusinessProfile: true,
        rateLimitType: 'none',
        isConfigured: () => true,
        isEnabled: () => true,
        executable: true,
        async healthCheck() {
            return { ok: true, status: 'CONNECTED', connectionStatus: 'CONNECTED', message: 'Excel/CSV import ready' };
        },
        usageDetails: usageNA,
    },
    {
        providerId: 'website_enrichment',
        providerName: 'Company Websites',
        providerType: PROVIDER_TYPES.WEBSITE_ENRICHMENT,
        categoryLabel: 'Free/manual source',
        priority: 5,
        supportsPagination: false,
        supportsResume: true,
        supportsLocation: false,
        supportsKeyword: false,
        supportsBusinessProfile: true,
        rateLimitType: 'domain_delay',
        isConfigured: () => true,
        isEnabled: (s) => discoveryCfg(s).websiteEnrichmentEnabled !== false,
        executable: true,
        async healthCheck() {
            return { ok: true, status: 'CONNECTED', connectionStatus: 'CONNECTED', message: 'Website enrichment ready (public pages only)' };
        },
        usageDetails: usageNA,
    },
    {
        providerId: 'facebook_public',
        providerName: 'Facebook Public Business Pages',
        providerType: PROVIDER_TYPES.SOCIAL_PUBLIC_PROFILE,
        categoryLabel: 'Free/manual source',
        priority: 6,
        supportsPagination: false,
        supportsResume: true,
        supportsLocation: false,
        supportsKeyword: true,
        supportsBusinessProfile: true,
        rateLimitType: 'request_delay',
        isConfigured: () => true,
        isEnabled: (s) => discoveryCfg(s).facebookPublicEnabled !== false && discoveryCfg(s).socialDiscoveryEnabled !== false,
        executable: true,
        async healthCheck() {
            return { ok: true, status: 'CONNECTED', connectionStatus: 'CONNECTED', message: 'Public Facebook Page URLs via search/manual import only' };
        },
        usageDetails: usageNA,
    },
    {
        providerId: 'instagram_public',
        providerName: 'Instagram Public Professional Accounts',
        providerType: PROVIDER_TYPES.SOCIAL_PUBLIC_PROFILE,
        categoryLabel: 'Free/manual source',
        priority: 7,
        supportsPagination: false,
        supportsResume: true,
        supportsLocation: false,
        supportsKeyword: true,
        supportsBusinessProfile: true,
        rateLimitType: 'request_delay',
        isConfigured: () => true,
        isEnabled: (s) => discoveryCfg(s).instagramPublicEnabled !== false && discoveryCfg(s).socialDiscoveryEnabled !== false,
        executable: true,
        async healthCheck() {
            return { ok: true, status: 'CONNECTED', connectionStatus: 'CONNECTED', message: 'Public Instagram professional URLs via search/manual import only' };
        },
        usageDetails: usageNA,
    },
    {
        providerId: 'serpapi',
        providerName: 'SerpAPI (Optional Paid)',
        providerType: PROVIDER_TYPES.SEARCH_PROVIDER,
        categoryLabel: 'Optional paid provider',
        priority: 8,
        supportsPagination: true,
        supportsResume: true,
        supportsLocation: true,
        supportsKeyword: true,
        supportsBusinessProfile: false,
        rateLimitType: 'api_key',
        isConfigured: (s) => isSerpApiConfigured(s),
        // Opt-in paid fallback only
        isEnabled: (s) => {
            const d = discoveryCfg(s);
            if (freeFirst(s) && d.allowPaidFallback !== true) return false;
            return d.serpapiEnabled === true && isSerpApiConfigured(s);
        },
        executable: true,
        async healthCheck(settings) {
            return testWebSearchProvider('serpapi', settings);
        },
        usageDetails: usageNA,
    },
    {
        providerId: 'google_places',
        providerName: 'Google Places (Optional Enrichment)',
        providerType: PROVIDER_TYPES.PLACE_PROVIDER,
        categoryLabel: 'Optional paid/usage-based enrichment',
        priority: 9,
        supportsPagination: false,
        supportsResume: true,
        supportsLocation: true,
        supportsKeyword: true,
        supportsBusinessProfile: true,
        rateLimitType: 'api_key',
        isConfigured: (s) => isGooglePlacesConfigured(s),
        isEnabled: (s) => {
            const d = discoveryCfg(s);
            if (freeFirst(s) && d.allowPaidFallback !== true && d.placesEnabled !== true) return false;
            return d.placesEnabled === true && isPlacesEnrichmentEnabled(s);
        },
        executable: true,
        async healthCheck(settings) {
            return testGoogleBusinessConnection(settings);
        },
        usageDetails: usageNA,
    },

    {
        providerId: 'browser_assisted',
        providerName: 'Browser-Assisted Local Agent',
        providerType: PROVIDER_TYPES.FUTURE_PROVIDER,
        categoryLabel: 'Local browser-assisted (not on Render)',
        priority: 15,
        supportsPagination: true,
        supportsResume: true,
        supportsLocation: true,
        supportsKeyword: true,
        supportsBusinessProfile: true,
        rateLimitType: 'request_delay',
        comingSoon: false,
        agentOnly: true,
        isConfigured: (s) => (s?.sourceConnectors?.discovery?.browserAssistedEnabled === true),
        isEnabled: (s) => (s?.sourceConnectors?.discovery?.browserAssistedEnabled === true),
        executable: false,
        async healthCheck(settings) {
            const on = settings?.sourceConnectors?.discovery?.browserAssistedEnabled === true;
            return {
                ok: on,
                status: on ? 'AGENT_REQUIRED' : 'DISABLED',
                connectionStatus: on ? 'AGENT_REQUIRED' : 'DISABLED',
                message: on
                    ? 'Enable local Discovery Agent on Windows. Browser automation does not run on Render.'
                    : 'Browser-assisted mode disabled in settings.',
            };
        },
        usageDetails: usageNA,
    },
    ...FUTURE.map(([providerId, providerName, providerType]) => ({
        providerId,
        providerName,
        providerType,
        categoryLabel: 'Coming Soon',
        priority: 100,
        supportsPagination: false,
        supportsResume: false,
        supportsLocation: true,
        supportsKeyword: true,
        supportsBusinessProfile: true,
        rateLimitType: 'none',
        isConfigured: () => false,
        isEnabled: () => false,
        executable: false,
        comingSoon: true,
        async healthCheck() {
            return { ok: false, status: 'NOT_CONFIGURED', connectionStatus: 'NOT_CONFIGURED', message: 'Coming Soon / Provider Not Configured' };
        },
        usageDetails: usageNA,
    })),
];

const PROVIDER_ALIASES = {
    company_websites: 'website_enrichment',
    excel_csv: 'excel_import',
    linkedin: 'linkedin_company',
    youtube: 'youtube_business',
    brave_search: 'brave',
};

export function resolveProviderId(providerId) {
    const id = String(providerId || '').trim();
    return PROVIDER_ALIASES[id] || id;
}

export function getProvider(providerId) {
    const id = resolveProviderId(providerId);
    return DISCOVERY_PROVIDERS.find((p) => p.providerId === id) || null;
}

export function listDiscoveryProviders(settings = null) {
    return DISCOVERY_PROVIDERS
        .slice()
        .sort((a, b) => (a.priority || 99) - (b.priority || 99))
        .map((p) => {
            const configured = !!p.isConfigured(settings);
            const enabled = !!p.isEnabled(settings);
            return {
                providerId: p.providerId,
                providerName: p.providerName,
                providerType: p.providerType,
                categoryLabel: p.categoryLabel,
                priority: p.priority,
                configured,
                enabled,
                comingSoon: !!p.comingSoon,
                executable: !!p.executable && configured && enabled && !p.comingSoon,
                statusLabel: p.comingSoon
                    ? 'Coming Soon / Provider Not Configured'
                    : (!configured ? 'Not configured' : (!enabled ? 'Disabled' : 'Configured')),
                supportsPagination: p.supportsPagination,
                supportsResume: p.supportsResume,
                supportsLocation: p.supportsLocation,
                supportsKeyword: p.supportsKeyword,
                supportsBusinessProfile: p.supportsBusinessProfile,
                rateLimitType: p.rateLimitType,
                ...p.usageDetails(settings),
            };
        });
}

export function assertProvidersExecutable(selectedIds = [], settings = null) {
    const selected = [...new Set((selectedIds || []).map((s) => resolveProviderId(s)).filter(Boolean))];
    const executable = [];
    const skipped = [];
    for (const id of selected) {
        const p = getProvider(id);
        if (!p) {
            skipped.push({ providerId: id, reason: 'Unknown provider' });
            continue;
        }
        if (p.comingSoon || !p.executable) {
            skipped.push({ providerId: id, reason: 'Coming Soon / Provider Not Configured' });
            continue;
        }
        if (!p.isConfigured(settings)) {
            skipped.push({ providerId: id, reason: 'Not configured' });
            continue;
        }
        if (!p.isEnabled(settings)) {
            skipped.push({ providerId: id, reason: 'Disabled' });
            continue;
        }
        executable.push(id);
    }
    return { selected, executable, skipped };
}

export function freeFirstProviderOrder() {
    return ['brave', 'indiamart', 'website_enrichment', 'facebook_public', 'instagram_public', 'serpapi', 'google_places'];
}
