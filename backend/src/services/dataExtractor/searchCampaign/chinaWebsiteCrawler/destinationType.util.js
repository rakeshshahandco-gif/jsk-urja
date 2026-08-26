/**
 * Classify a discovered URL as marketplace / company site / search result / etc.
 * Discovery source (Baidu) is independent of destination type (abc.cn).
 */
import {
    DESTINATION_TYPES,
    DIRECTORY_HOSTS_CN,
    MARKETPLACE_HOSTS,
    SEARCH_ENGINE_HOSTS,
    SOCIAL_HOSTS_CN,
} from './constants.js';

function hostnameOf(raw) {
    try {
        const u = new URL(String(raw || '').trim());
        return String(u.hostname || '').replace(/^www\./i, '').toLowerCase();
    } catch {
        return '';
    }
}

function hostMatches(host, list) {
    if (!host) return false;
    return list.some((h) => {
        const n = String(h).replace(/^www\./i, '').toLowerCase();
        return host === n || host.endsWith(`.${n}`);
    });
}

export function classifyDestinationType(rawUrl, { title = '', snippet = '' } = {}) {
    const url = String(rawUrl || '').trim();
    const host = hostnameOf(url);
    const path = (() => {
        try { return new URL(url).pathname.toLowerCase(); } catch { return ''; }
    })();
    const blob = `${title} ${snippet} ${url}`.toLowerCase();

    if (hostMatches(host, SEARCH_ENGINE_HOSTS)) return DESTINATION_TYPES.SEARCH_ENGINE_RESULT;
    if (hostMatches(host, SOCIAL_HOSTS_CN) || /facebook\.com|linkedin\.com|instagram\.com/.test(host)) {
        return DESTINATION_TYPES.SOCIAL_OTHER;
    }
    if (hostMatches(host, MARKETPLACE_HOSTS)) return DESTINATION_TYPES.MARKETPLACE_LISTING;
    if (hostMatches(host, DIRECTORY_HOSTS_CN)) return DESTINATION_TYPES.COMPANY_PROFILE_DIRECTORY;
    if (/\/product|item\.|detail\.|offer/.test(path) && hostMatches(host, MARKETPLACE_HOSTS)) {
        return DESTINATION_TYPES.MARKETPLACE_LISTING;
    }
    if (/\.(cn|com\.cn|net\.cn)$/i.test(host) && !hostMatches(host, SEARCH_ENGINE_HOSTS)) {
        return DESTINATION_TYPES.COMPANY_WEBSITE;
    }
    if (/公司|科技有限|厂家|工厂|供应商/.test(blob) && host && !hostMatches(host, SEARCH_ENGINE_HOSTS)) {
        return DESTINATION_TYPES.COMPANY_WEBSITE;
    }
    if (host) return DESTINATION_TYPES.COMPANY_WEBSITE;
    return DESTINATION_TYPES.UNKNOWN;
}

export function isSearchEngineHost(rawUrl) {
    return hostMatches(hostnameOf(rawUrl), SEARCH_ENGINE_HOSTS);
}

export function isMarketplaceHost(rawUrl) {
    return hostMatches(hostnameOf(rawUrl), MARKETPLACE_HOSTS);
}

export function isDirectoryHostCn(rawUrl) {
    return hostMatches(hostnameOf(rawUrl), DIRECTORY_HOSTS_CN);
}

export { hostnameOf };
