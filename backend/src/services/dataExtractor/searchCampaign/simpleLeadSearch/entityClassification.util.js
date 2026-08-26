/**
 * Entity classification for Simple Lead Search verified-company gating.
 * Directory/category pages stay discovery sources. Does not invent companies.
 */
import { DIRECTORY_HOSTS } from '../rawCaptureEnrichment/constants.js';

function normalizeDomain(hostOrUrl = '') {
    const raw = String(hostOrUrl || '').trim().toLowerCase();
    if (!raw) return '';
    try {
        const u = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
        return u.hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        return raw.replace(/^www\./i, '').split('/')[0];
    }
}

function isDirectoryHost(domain) {
    const d = normalizeDomain(domain);
    return DIRECTORY_HOSTS.some((h) => d === h || d.endsWith(`.${h}`));
}

export const ENTITY_TYPES = Object.freeze([
    'COMPANY',
    'DIRECTORY',
    'MARKETPLACE',
    'ASSOCIATION',
    'CATEGORY_PAGE',
    'ARTICLE',
    'JOB_COURSE_TRAINING',
    'UNKNOWN',
]);

const MARKETPLACE_HOSTS = Object.freeze([
    'indiamart.com', 'tradeindia.com', 'exportersindia.com', 'amazon.in', 'flipkart.com',
]);

const ASSOCIATION_RE = /\b(association|federation|chamber of commerce|chamber|confederation|member director(?:y|ies)|industry listing|trade body)\b/i;

const JOB_COURSE_RE = /\b(job opening|jobs|vacancy|vacancies|recruitment|hiring|career|internship|course|courses|training|tutorial|certification|workshop)\b/i;

const ARTICLE_RE = /\b(news|article|blog|press release|how to|guide to)\b/i;

const GENERIC_SEO_TITLE_RE = /^(best|top|leading|list of|find)\b|\bmanufacturers?\s+in\s+|\bsuppliers?\s+in\s+|\bdealers?\s+in\s+|\b(led lights?|home automation|smart switch(?:es)?)\s+in\s+/i;

export function isGenericSeoCompanyTitle(value = '') {
    const s = String(value || '').replace(/\s+/g, ' ').trim();
    if (!s) return false;
    if (s.length > 90) return true;
    if (GENERIC_SEO_TITLE_RE.test(s)) return true;
    if (/\bin\s+[A-Z][a-z]+(?:\s*,\s*[A-Z][a-z]+)?\s*$/.test(s) && /manufacturer|supplier|dealer|distributor|lighting/i.test(s)) {
        return true;
    }
    return false;
}

export function looksLikeCompanyName(value = '') {
    const s = String(value || '').replace(/\s+/g, ' ').trim();
    if (s.length < 3 || s.length > 80) return false;
    if (isGenericSeoCompanyTitle(s)) return false;
    if (/^(home|welcome|index|contact us|about us|products)$/i.test(s)) return false;
    if (/indiamart|justdial|tradeindia|exportersindia|yellow pages/i.test(s)) return false;
    return true;
}

function hostOf(urlOrHost = '') {
    return normalizeDomain(urlOrHost);
}

export function classifyEntityType({
    url = '',
    title = '',
    snippet = '',
    enrichment = {},
    qualification = {},
} = {}) {
    if (enrichment.entityType && ENTITY_TYPES.includes(enrichment.entityType)) {
        return {
            entityType: enrichment.entityType,
            companyEntityConfidence: enrichment.companyEntityConfidence || (enrichment.entityType === 'COMPANY' ? 'Medium' : 'Low'),
            reason: 'stored entityType',
        };
    }
    const urls = [
        url,
        enrichment.websiteUrl,
        enrichment.canonicalDomain,
        enrichment.directoryProfileUrl,
        enrichment.directoryPlatform,
    ].filter(Boolean);
    const blob = `${title || ''} ${snippet || ''} ${enrichment.companyName || ''}`;
    const directoryHost = urls.some((u) => isDirectoryHost(u));
    const marketplaceHost = urls.some((u) => {
        const h = hostOf(u);
        return MARKETPLACE_HOSTS.some((m) => h === m || h.endsWith(`.${m}`));
    });

    if (enrichment.isDirectorySource || directoryHost || qualification.businessType === 'directory_marketplace') {
        const entityType = marketplaceHost ? 'MARKETPLACE' : 'DIRECTORY';
        return {
            entityType,
            companyEntityConfidence: 'Low',
            reason: 'directory/marketplace host or listing',
        };
    }
    if (ASSOCIATION_RE.test(blob)) {
        return { entityType: 'ASSOCIATION', companyEntityConfidence: 'Low', reason: 'association/member-list language' };
    }
    if (JOB_COURSE_RE.test(blob) && !/we manufacture|our factory|production facility/i.test(blob)) {
        return { entityType: 'JOB_COURSE_TRAINING', companyEntityConfidence: 'Low', reason: 'job/course/training page' };
    }
    if (ARTICLE_RE.test(blob) && isGenericSeoCompanyTitle(title)) {
        return { entityType: 'ARTICLE', companyEntityConfidence: 'Low', reason: 'article/list page' };
    }
    if (isGenericSeoCompanyTitle(title) && directoryHost) {
        return { entityType: 'CATEGORY_PAGE', companyEntityConfidence: 'Low', reason: 'generic category title on directory host' };
    }
    const host = hostOf(urls[0] || '');
    if (host && !DIRECTORY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
        return { entityType: 'COMPANY', companyEntityConfidence: looksLikeCompanyName(title) ? 'Medium' : 'Low', reason: 'first-party domain' };
    }
    return { entityType: 'UNKNOWN', companyEntityConfidence: 'Low', reason: 'insufficient identity evidence' };
}

export function isCompanyEntityType(entityType = '') {
    return String(entityType || '').toUpperCase() === 'COMPANY';
}

export function isNonCompanyDiscoveryEntity(enrichment = {}, genuineness = {}, qualification = {}) {
    const classified = classifyEntityType({
        url: enrichment.websiteUrl || enrichment.canonicalDomain || genuineness.websiteUrl || '',
        title: enrichment.canonicalCompanyName || enrichment.companyName || genuineness.companyName || '',
        enrichment,
        qualification,
    });
    if (classified.entityType === 'COMPANY') return false;
    if (classified.entityType === 'UNKNOWN') {
        if (enrichment.isDirectorySource) return true;
        if (String(genuineness.systemDecision || genuineness.genuinenessDecision || '') === 'directory_or_marketplace_only') return true;
        if (qualification.businessType === 'directory_marketplace') return true;
        return false;
    }
    return true;
}

export function resolveCanonicalCompanyName({
    jsonLdName = '',
    legalName = '',
    ogSiteName = '',
    copyrightName = '',
    headerName = '',
    googleTitle = '',
    isDirectory = false,
} = {}) {
    if (isDirectory) {
        return {
            name: '',
            confidence: 'Low',
            evidence: 'Directory/category page is a discovery source, not a company name.',
        };
    }
    const ranked = [
        { value: legalName, evidence: 'legal/schema legalName' },
        { value: jsonLdName, evidence: 'schema.org Organization name' },
        { value: ogSiteName, evidence: 'og:site_name' },
        { value: copyrightName, evidence: 'footer copyright/legal name' },
        { value: headerName, evidence: 'header/logo text' },
    ];
    for (const row of ranked) {
        const v = String(row.value || '').replace(/\s+/g, ' ').trim();
        if (looksLikeCompanyName(v)) {
            return { name: v.slice(0, 200), confidence: 'High', evidence: row.evidence };
        }
    }
    const title = String(googleTitle || '').split('|')[0].split('-')[0].replace(/\s+/g, ' ').trim();
    if (looksLikeCompanyName(title)) {
        return { name: title.slice(0, 200), confidence: 'Medium', evidence: 'page/Google title (not a generic SEO heading)' };
    }
    return {
        name: '',
        confidence: 'Low',
        evidence: isGenericSeoCompanyTitle(googleTitle || title)
            ? `Generic SEO title not used as company name (${String(googleTitle || title).slice(0, 80)}).`
            : 'No reliable canonical company name found.',
    };
}

function stripTags(html = '') {
    return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function extractOgSiteName(html = '') {
    const m = String(html || '').match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
        || String(html || '').match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
    return m ? String(m[1]).replace(/\s+/g, ' ').trim().slice(0, 120) : '';
}

export function extractCopyrightName(html = '') {
    const text = stripTags(String(html || '').slice(-8000));
    const m = text.match(/©\s*(?:copyright\s+)?(?:20\d{2}\s+)?([A-Z][A-Za-z0-9&.,'’\-\s]{2,70}?)(?:\.|,|\s+all rights|\s+pvt|\s+ltd|$)/i);
    if (!m) return '';
    const name = String(m[1] || '').replace(/\s+/g, ' ').trim();
    return looksLikeCompanyName(name) ? name.slice(0, 120) : '';
}

/**
 * Conservative listing extraction from public HTML (JSON-LD ItemList + obvious company links).
 * Skips generic category titles. Does not invent contacts.
 */
export function extractDirectoryListings(html = '', pageUrl = '') {
    const out = [];
    const seen = new Set();
    const push = (name, href, extra = {}) => {
        const n = String(name || '').replace(/\s+/g, ' ').trim();
        if (!looksLikeCompanyName(n)) return;
        let url = String(href || '').trim();
        try {
            if (url) url = new URL(url, pageUrl).href;
        } catch {
            url = '';
        }
        const key = `${n.toLowerCase()}|${url.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        const host = hostOf(url);
        const firstParty = url && host && !isDirectoryHost(host);
        out.push({
            companyName: n.slice(0, 200),
            listingUrl: url.slice(0, 2048),
            websiteUrl: firstParty ? url.slice(0, 2048) : '',
            sourceDirectoryUrl: String(pageUrl || '').slice(0, 2048),
            ...extra,
        });
    };

    const jsonBlocks = String(html || '').match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
    for (const block of jsonBlocks.slice(0, 8)) {
        const raw = block.replace(/<\/?script[^>]*>/gi, '').trim();
        try {
            const data = JSON.parse(raw);
            const nodes = Array.isArray(data) ? data : [data];
            for (const node of nodes) {
                const els = node?.itemListElement || node?.mainEntity?.itemListElement || [];
                for (const el of (Array.isArray(els) ? els : []).slice(0, 30)) {
                    const item = el?.item || el;
                    push(item?.name || el?.name, item?.url || item?.sameAs || el?.url);
                }
            }
        } catch {
            /* ignore invalid JSON-LD */
        }
    }

    const aRe = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    const htmlStr = String(html || '');
    while ((m = aRe.exec(htmlStr)) !== null && out.length < 25) {
        const href = m[1];
        const label = stripTags(m[2]).slice(0, 120);
        if (!/\/(company|proddetail|catalog|dtl|profile)\b/i.test(href) && !/justdial\.com\/.+\/[A-Za-z0-9-]+\/nct-/i.test(href)) {
            continue;
        }
        push(label, href);
    }
    return out.slice(0, 25);
}
