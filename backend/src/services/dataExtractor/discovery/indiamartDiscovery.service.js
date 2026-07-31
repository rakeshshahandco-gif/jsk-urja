/**
 * IndiaMART discovery — Manual URL / Excel import + optional Brave site: discovery.
 * Active high-concurrency scraping of IndiaMART is NOT implemented.
 * Direct automatic crawl is disabled by default (PUBLIC_ACCESS_ONLY / Manual modes).
 */
import { assertResolvedPublicUrl, assertPublicHttpUrl } from './ssrfGuard.js';
import { isUrlAllowedByRobots } from '../robotsCheck.js';
import { normalizeExtractorUrl, scoreExtractorConfidence } from '../extractor.utils.js';

const IM_HOST = /(^|\.)indiamart\.com$/i;

export function isIndiamartUrl(raw) {
    try {
        const u = new URL(assertPublicHttpUrl(raw));
        return IM_HOST.test(u.hostname.replace(/^www\./, ''));
    } catch {
        return false;
    }
}

export function normalizeIndiamartUrl(raw) {
    const u = new URL(assertPublicHttpUrl(raw));
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (!IM_HOST.test(host)) throw new Error('Not an IndiaMART URL');
    // Reject obvious private/login paths
    const path = u.pathname.toLowerCase();
    if (/\/(login|signin|buyer|enquiry|message|dashboard|sellerpanel)/.test(path)) {
        throw new Error('IndiaMART login/private URLs are not allowed');
    }
    return u.origin + u.pathname.replace(/\/+$/, '') + (u.pathname.endsWith('/') ? '' : '');
}

export function classifyIndiamartUrl(raw) {
    const url = normalizeIndiamartUrl(raw);
    const path = new URL(url).pathname.toLowerCase();
    let type = 'search_result';
    if (/\/proddetail\//.test(path) || /\/product\//.test(path)) type = 'product_listing';
    else if (/\/company\//.test(path) || /\/seller\//.test(path) || /\/indiamart\.com\/[^/]+\/?$/.test(url.toLowerCase())) {
        type = 'company_profile';
    }
    return { type, url };
}

function discoveryCfg(settings) {
    return settings?.sourceConnectors?.discovery || {};
}

export function getIndiamartDiscoveryConfig(settings = null) {
    const d = discoveryCfg(settings);
    return {
        enabled: d.indiamartEnabled !== false,
        publicDiscoveryMode: d.indiamartPublicDiscoveryMode === true, // opt-in; uses Brave site: only
        manualUrlMode: d.indiamartManualUrlMode !== false,
        excelImportMode: d.indiamartExcelImportMode !== false,
        maxPagesPerJob: Math.min(50, Math.max(1, Number(d.indiamartMaxPagesPerJob) || 10)),
        maxRecordsPerJob: Math.min(500, Math.max(1, Number(d.indiamartMaxRecordsPerJob) || 50)),
        requestDelayMs: Math.max(2000, Number(d.indiamartRequestDelayMs) || 7000),
        timeoutMs: Math.max(5000, Number(d.indiamartTimeoutMs) || 15000),
        // Direct scraping of IndiaMART SERP is intentionally unavailable
        directActiveScrapeAvailable: false,
    };
}

/**
 * Honest availability probe — does not scrape IndiaMART search indexes.
 */
export async function testIndiamartAvailability(settings = null) {
    const cfg = getIndiamartDiscoveryConfig(settings);
    if (!cfg.enabled) {
        return {
            ok: false,
            status: 'DISABLED',
            connectionStatus: 'DISABLED',
            message: 'IndiaMART provider is disabled in settings.',
        };
    }
    if (!cfg.directActiveScrapeAvailable && !cfg.publicDiscoveryMode) {
        return {
            ok: true,
            status: 'PUBLIC_ACCESS_ONLY',
            connectionStatus: 'PUBLIC_ACCESS_ONLY',
            message: 'IndiaMART automatic crawl is unavailable. Manual URL and Excel/CSV import modes are enabled. Optional public discovery via Brave site:indiamart.com can be enabled when Brave is configured.',
            modes: {
                manualUrl: cfg.manualUrlMode,
                excelImport: cfg.excelImportMode,
                publicViaBrave: false,
                directScrape: false,
            },
        };
    }
    return {
        ok: true,
        status: 'PUBLIC_ACCESS_ONLY',
        connectionStatus: 'PUBLIC_ACCESS_ONLY',
        message: 'IndiaMART public discovery uses Brave site:indiamart.com when enabled. Direct scraping remains disabled. Manual URL and Excel/CSV import are supported.',
        modes: {
            manualUrl: cfg.manualUrlMode,
            excelImport: cfg.excelImportMode,
            publicViaBrave: !!cfg.publicDiscoveryMode,
            directScrape: false,
        },
    };
}

function detectBlockedHtml(html, finalUrl = '') {
    const text = String(html || '').toLowerCase();
    const url = String(finalUrl || '').toLowerCase();
    if (/captcha|recaptcha|hcaptcha|verify you are human/.test(text)) {
        return { status: 'CAPTCHA_BLOCKED', message: 'IndiaMART page requires CAPTCHA — skipped' };
    }
    if (/login|sign in|seller panel|authenticate/.test(text) && (/\/login|\/signin/.test(url) || text.includes('password'))) {
        return { status: 'LOGIN_REQUIRED', message: 'IndiaMART login-protected page — skipped' };
    }
    if (/access denied|too many requests|429|rate limit/.test(text)) {
        return { status: 'RATE_LIMITED', message: 'IndiaMART rate limited — skipped' };
    }
    return null;
}

function extractBetween(html, re) {
    const m = String(html || '').match(re);
    return m ? String(m[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

/**
 * Safely extract public fields from one IndiaMART URL.
 */
export async function enrichIndiamartPublicUrl(rawUrl, settings = null) {
    const cfg = getIndiamartDiscoveryConfig(settings);
    const classified = classifyIndiamartUrl(rawUrl);
    const url = classified.url;

    const allowed = await isUrlAllowedByRobots(url).catch(() => true);
    if (allowed === false) {
        return { record: null, status: 'FAILED', message: 'Blocked by robots.txt', url };
    }

    try {
        await assertResolvedPublicUrl(url);
    } catch (err) {
        return { record: null, status: 'FAILED', message: err.message || 'SSRF blocked', url };
    }

    let res;
    try {
        res = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            headers: {
                'User-Agent': 'JSK-E-SARTHI-DiscoveryBot/1.0 (+public-business-discovery; respectful)',
                Accept: 'text/html',
            },
            signal: AbortSignal.timeout(cfg.timeoutMs),
        });
    } catch (err) {
        return { record: null, status: 'FAILED', message: err.message || 'Fetch failed', url };
    }

    if (res.status === 401 || res.status === 403) {
        return { record: null, status: 'LOGIN_REQUIRED', message: 'Access restricted', url };
    }
    if (res.status === 429) {
        return { record: null, status: 'RATE_LIMITED', message: 'Rate limited', url };
    }
    if (!res.ok) {
        return { record: null, status: 'FAILED', message: 'HTTP ' + res.status, url };
    }

    const html = await res.text();
    const blocked = detectBlockedHtml(html, res.url || url);
    if (blocked) {
        return { record: null, status: blocked.status, message: blocked.message, url };
    }

    const title = extractBetween(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const companyName = title.split('|')[0].split('-')[0].trim().slice(0, 200)
        || extractBetween(html, /property=["']og:title["'][^>]*content=["']([^"']+)/i);
    const description = extractBetween(html, /name=["']description["'][^>]*content=["']([^"']+)/i)
        || extractBetween(html, /property=["']og:description["'][^>]*content=["']([^"']+)/i);
    const phoneMatch = html.match(/(?:\+91[\s-]?)?[6-9]\d{9}/);
    const emailMatch = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const gstMatch = html.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]\b/);
    const websiteMatch = html.match(/https?:\/\/(?!(?:www\.)?indiamart\.com)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s"'<>]*/);

    const record = {
        companyName: companyName || 'IndiaMART listing',
        website: websiteMatch ? websiteMatch[0].split('"')[0] : '',
        email: emailMatch ? emailMatch[0] : '',
        phone: phoneMatch ? phoneMatch[0] : '',
        businessDescription: description.slice(0, 500),
        sourcePlatform: 'indiamart',
        sourceUrl: url,
        extractedAt: new Date(),
        lastCheckedAt: new Date(),
        socialLinks: {},
        rawExtractedData: {
            sourceProvider: 'indiamart',
            sourceProviders: ['indiamart'],
            indiamartProfileUrl: classified.type === 'company_profile' ? url : '',
            indiamartProductUrl: classified.type === 'product_listing' ? url : '',
            indiamartSourceType: classified.type,
            publicOnly: true,
        },
        confidenceScore: 0,
    };
    if (gstMatch) record.rawExtractedData.gstin = gstMatch[0];
    if (record.website) {
        const { domain } = normalizeExtractorUrl(record.website);
        record.normalizedDomain = domain;
    }
    record.confidenceScore = scoreExtractorConfidence(record);
    return { record, status: 'CONNECTED', message: 'Public fields extracted', url };
}

export function buildIndiamartBraveQuery(keyword, city, state, country) {
    const parts = [String(keyword || '').trim(), 'site:indiamart.com'];
    if (city) parts.push(String(city).trim());
    if (state) parts.push(String(state).trim());
    if (country) parts.push(String(country).trim());
    return parts.filter(Boolean).join(' ');
}
