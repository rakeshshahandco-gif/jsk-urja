/**
 * Safe website / listing identity keys for verified-company grouping.
 * Shared by contact-merge and canonical verified-company builders.
 */
import { isDirectoryHost, normalizeDomain } from '../rawCaptureEnrichment/parse.util.js';
import { DIRECTORY_HOSTS } from '../rawCaptureEnrichment/constants.js';

/** Multi-tenant / hosted platforms — never reduce to registrable parent alone. */
export const HOSTED_PLATFORM_SUFFIXES = Object.freeze([
    'spiderai.in',
    'wixsite.com',
    'wixpress.com',
    'myshopify.com',
    'wordpress.com',
    'blogspot.com',
    'github.io',
    'netlify.app',
    'vercel.app',
    'webflow.io',
    'squarespace.com',
    'godaddysites.com',
    'business.site',
    'carrd.co',
    'notion.site',
    'framer.website',
    'web.app',
    'firebaseapp.com',
    'herokuapp.com',
    'azurewebsites.net',
    'pages.dev',
]);

function parseUrlParts(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    try {
        const u = s.includes('://') ? new URL(s) : new URL(`https://${s}`);
        const hostname = u.hostname.replace(/^www\./i, '').toLowerCase();
        const path = (u.pathname || '/').replace(/\/+$/, '') || '';
        return { hostname, path, href: `${hostname}${path}`.toLowerCase() };
    } catch {
        const host = normalizeDomain(s);
        return host ? { hostname: host, path: '', href: host } : null;
    }
}

export function isHostedPlatformHostname(hostname) {
    const h = String(hostname || '').replace(/^www\./i, '').toLowerCase();
    if (!h) return false;
    return HOSTED_PLATFORM_SUFFIXES.some((suffix) => h === suffix || h.endsWith(`.${suffix}`));
}

export function isDirectoryOrMarketplaceHostname(hostname) {
    const h = String(hostname || '').replace(/^www\./i, '').toLowerCase();
    if (!h) return false;
    if (isDirectoryHost(h)) return true;
    return DIRECTORY_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

/**
 * Official website: hostname only (no path/query).
 * Hosted platform: full hostname (subdomain.spiderai.in), never parent alone.
 * Directory/marketplace: hostname + listing path (not bare justdial.com).
 */
export function buildWebsiteIdentityKey(urlOrHost, { isDirectory = false } = {}) {
    const parts = parseUrlParts(urlOrHost);
    if (!parts?.hostname) return '';
    const hosted = isHostedPlatformHostname(parts.hostname);
    const directory = isDirectory || isDirectoryOrMarketplaceHostname(parts.hostname);
    if (directory) {
        return parts.path && parts.path !== '/'
            ? `listing:${parts.hostname}${parts.path}`
            : `listing:${parts.hostname}`;
    }
    if (hosted) return `hosted:${parts.hostname}`;
    return `site:${parts.hostname}`;
}
