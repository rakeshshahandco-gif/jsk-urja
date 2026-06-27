import {
    getIndiamartConfigMessage,
    isIndiamartConfigured,
    searchIndiamart,
    testIndiamartConnection,
} from './indiamartAdapter.js';
import {
    getJustdialConfigMessage,
    isJustdialConfigured,
    searchJustdial,
    testJustdialConnection,
    buildJustdialWebhookUrl,
    ensureJustdialWebhookToken,
} from './justdialAdapter.js';
import {
    getTradeindiaConfigMessage,
    isTradeindiaConfigured,
    searchTradeindia,
    testTradeindiaConnection,
} from './tradeindiaAdapter.js';

export const PORTAL_ADAPTERS = {
    indiamart: {
        id: 'indiamart',
        label: 'IndiaMART (Your Inbox)',
        phase: 4,
        isConfigured: () => isIndiamartConfigured(),
        getConfigMessage: () => getIndiamartConfigMessage(),
        search: (input, settings) => searchIndiamart(input, settings),
        test: () => testIndiamartConnection(),
        description: 'Official Lead Manager Pull API — syncs buyer inquiries to your IndiaMART seller account.',
    },
    justdial: {
        id: 'justdial',
        label: 'Justdial (Your Leads)',
        phase: 4,
        isConfigured: (settings) => isJustdialConfigured(settings),
        getConfigMessage: (settings, baseUrl) => getJustdialConfigMessage(settings, baseUrl),
        search: (input, settings, companyId) => searchJustdial(input, settings, companyId),
        test: (settings, companyId) => testJustdialConnection(settings, companyId),
        description: 'Official webhook push — Justdial sends leads to your CRM after your account manager configures the URL.',
        needsCompanyId: true,
    },
    tradeindia: {
        id: 'tradeindia',
        label: 'TradeIndia (Your Inquiries)',
        phase: 4,
        isConfigured: () => isTradeindiaConfigured(),
        getConfigMessage: () => getTradeindiaConfigMessage(),
        search: (input, settings) => searchTradeindia(input, settings),
        test: () => testTradeindiaConnection(),
        description: 'Official My Inquiry Pull API — syncs buyer inquiries from your TradeIndia seller account.',
    },
};

function webhookBaseUrl() {
    return process.env.DATA_EXTRACTOR_WEBHOOK_BASE_URL || process.env.API_PUBLIC_URL || 'http://localhost:5000';
}

export function getPortalAdapter(sourceId) {
    return PORTAL_ADAPTERS[String(sourceId || '').trim().toLowerCase()] || null;
}

export function listPortalAdapterStatus(settings) {
    const baseUrl = webhookBaseUrl();
    return Object.values(PORTAL_ADAPTERS).map((a) => {
        const configured = a.needsCompanyId ? a.isConfigured(settings) : a.isConfigured();
        const entry = {
            id: a.id,
            label: a.label,
            configured,
            message: a.needsCompanyId ? a.getConfigMessage(settings, baseUrl) : a.getConfigMessage(),
            description: a.description,
        };
        if (a.id === 'justdial' && settings) {
            const token = settings?.sourceConnectors?.justdial?.webhookToken;
            if (token) entry.webhookUrl = buildJustdialWebhookUrl(baseUrl, token);
        }
        return entry;
    });
}

export async function testPortalAdapter(sourceId, settings, companyId) {
    const adapter = getPortalAdapter(sourceId);
    if (!adapter) return { ok: false, message: `Unknown portal adapter: ${sourceId}` };
    if (adapter.needsCompanyId) {
        if (!companyId) return { ok: false, message: 'Company context required' };
        return adapter.test(settings, companyId);
    }
    if (!adapter.isConfigured()) return { ok: false, message: adapter.getConfigMessage() };
    return adapter.test();
}

export async function runPortalSearch(sourceId, input, settings, companyId = null) {
    const adapter = getPortalAdapter(sourceId);
    if (!adapter) {
        return {
            records: [],
            errors: [`Portal source "${sourceId}" is not available.`],
            metadata: { sourceStatus: 'unknown', adapterId: sourceId },
        };
    }

    const configured = adapter.needsCompanyId ? adapter.isConfigured(settings) : adapter.isConfigured();
    if (!configured && adapter.id !== 'justdial') {
        return {
            records: [],
            errors: [adapter.getConfigMessage(settings, webhookBaseUrl())],
            metadata: { sourceStatus: 'not_configured', adapterId: sourceId },
        };
    }

    if (adapter.needsCompanyId && companyId) {
        await ensureJustdialWebhookToken(companyId);
        return adapter.search(input, settings, companyId);
    }

    return adapter.search(input, settings);
}

export { ensureJustdialWebhookToken, buildJustdialWebhookUrl };
