/**
 * Checkpoint 6A — bounded public page fetch (robots + SSRF + page limits).
 */
import { isUrlAllowedByRobots } from '../../robotsCheck.js';
import { assertResolvedPublicUrl } from '../../discovery/ssrfGuard.js';
import { MAX_PAGES_PER_DOMAIN, PAGE_FETCH_TIMEOUT_MS } from './constants.js';
import { dedupeAddresses } from './addressExtract.util.js';
import { normalizeDomain, parsePageBundle } from './parse.util.js';

const USER_AGENT = 'CRM-Data-Extractor-CP6/1.0 (+localhost; public-business-enrichment-only)';

async function fetchHtml(url) {
    const allowed = await isUrlAllowedByRobots(url, 5000);
    if (!allowed) return { ok: false, error: 'Blocked by robots.txt', html: '', finalUrl: url };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT_MS);
    try {
        const safeUrl = await assertResolvedPublicUrl(url);
        const res = await fetch(safeUrl, {
            signal: controller.signal,
            headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': USER_AGENT },
            redirect: 'follow',
        });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, html: '', finalUrl: safeUrl };
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
            return { ok: false, error: 'Non-HTML response', html: '', finalUrl: safeUrl };
        }
        const html = await res.text();
        if (html.length > 2_000_000) return { ok: false, error: 'Response too large', html: '', finalUrl: safeUrl };
        return { ok: true, html, error: '', finalUrl: res.url || safeUrl };
    } catch (err) {
        return { ok: false, error: err?.message || 'Fetch failed', html: '', finalUrl: url };
    } finally {
        clearTimeout(timer);
    }
}

function mergePage(acc, page) {
    if (!acc.companyName && page.companyName) acc.companyName = page.companyName;
    if (!acc.legalOrDisplayedName && page.legalOrDisplayedName) acc.legalOrDisplayedName = page.legalOrDisplayedName;
    acc.emails = [...(acc.emails || []), ...(page.emails || [])];
    acc.phones = [...(acc.phones || []), ...(page.phones || [])];
    acc.whatsappNumbers = [...(acc.whatsappNumbers || []), ...(page.whatsappNumbers || [])];
    acc.addresses = dedupeAddresses([...(acc.addresses || []), ...(page.addresses || [])]);
    acc.contactPersons = [...(acc.contactPersons || []), ...(page.contactPersons || [])];
    acc.productsServices = [...new Set([...(acc.productsServices || []), ...(page.productsServices || [])])].slice(0, 30);
    acc.sourceEvidence = [...(acc.sourceEvidence || []), ...(page.evidence || [])];
    if (!acc.city && page.city) acc.city = page.city;
    if (!acc.state && page.state) acc.state = page.state;
    if (!acc.country && page.country) acc.country = page.country;
    if (page.social?.facebook?.url && !acc.facebook?.url) {
        acc.facebook = { ...page.social.facebook, matchConfidence: page.social.facebook.matchConfidence || 'verified', evidence: page.social.facebook.evidence || ['official website link'] };
    }
    if (page.social?.instagram?.url && !acc.instagram?.url) {
        acc.instagram = { ...page.social.instagram, matchConfidence: page.social.instagram.matchConfidence || 'verified', evidence: page.social.instagram.evidence || ['official website link'] };
    }
    if (page.social?.linkedin?.url && !acc.linkedin?.url) {
        acc.linkedin = { ...page.social.linkedin, matchConfidence: page.social.linkedin.matchConfidence || 'verified', evidence: page.social.linkedin.evidence || ['official website link'] };
    }
    if (page.social?.youtube?.url && !acc.youtube?.url) {
        acc.youtube = { ...page.social.youtube, matchConfidence: page.social.youtube.matchConfidence || 'verified', evidence: page.social.youtube.evidence || ['official website link'] };
    }
    if (!acc.gstin && page.gstin) { acc.gstin = page.gstin; acc.gstinSourceUrl = page.gstinSourceUrl || ''; }
    if (Array.isArray(page.rejectedPhones) && page.rejectedPhones.length) {
        acc.rejectedPhones = [...(acc.rejectedPhones || []), ...page.rejectedPhones].slice(0, 40);
    }
    if (page.businessType && page.businessType !== 'unknown') {
        if (!acc.businessType || acc.businessType === 'unknown') {
            acc.businessType = page.businessType;
            acc.manufacturerEvidence = page.manufacturerEvidence || '';
        }
    }
    return acc;
}

/**
 * Enrich one seed URL / domain with homepage + up to MAX_PAGES_PER_DOMAIN-1 related pages.
 */
export async function enrichDomainFromWebsite(seedUrl, opts = {}) {
    const maxPages = opts.maxPages || MAX_PAGES_PER_DOMAIN;
    const pagesVisited = [];
    const errors = [];
    let seed;
    try {
        seed = await assertResolvedPublicUrl(seedUrl);
    } catch (err) {
        return { ok: false, error: err?.message || 'Unsafe URL', pagesVisited, data: null };
    }

    const domain = normalizeDomain(seed);
    const homepage = (() => {
        try {
            const u = new URL(seed);
            return `${u.protocol}//${u.host}/`;
        } catch {
            return seed;
        }
    })();

    const queue = [homepage];
    if (seed !== homepage) queue.push(seed);

    let acc = {
        websiteUrl: homepage,
        canonicalDomain: domain,
        companyName: '',
        legalOrDisplayedName: '',
        emails: [],
        phones: [],
        whatsappNumbers: [],
        addresses: [],
        contactPersons: [],
        productsServices: [],
        sourceEvidence: [],
        city: '',
        state: '',
        country: '',
        facebook: {},
        instagram: {},
        linkedin: {},
        youtube: {},
        businessType: 'unknown',
        manufacturerEvidence: '',
    };

    const seen = new Set();
    while (queue.length && pagesVisited.length < maxPages) {
        const next = queue.shift();
        const key = next.replace(/\/$/, '').toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const fetched = await fetchHtml(next);
        if (!fetched.ok) {
            errors.push(`${next}: ${fetched.error}`);
            continue;
        }
        pagesVisited.push(fetched.finalUrl || next);
        const page = parsePageBundle(fetched.html, fetched.finalUrl || next);
        acc = mergePage(acc, page);

        for (const pathUrl of page.candidatePaths || []) {
            if (normalizeDomain(pathUrl) !== domain) continue;
            const k = pathUrl.replace(/\/$/, '').toLowerCase();
            if (!seen.has(k) && queue.length + pagesVisited.length < maxPages + 3) queue.push(pathUrl);
        }
    }

    if (!pagesVisited.length) {
        return { ok: false, error: errors[0] || 'No pages fetched', pagesVisited, data: null };
    }

    // Dedupe collections
    const { dedupeEmails, dedupePhones } = await import('./parse.util.js');
    acc.emails = dedupeEmails(acc.emails);
    acc.phones = dedupePhones(acc.phones);
    acc.whatsappNumbers = dedupePhones(acc.whatsappNumbers);
    // Remove whatsapp from general phones when same normalized number
    const waSet = new Set(acc.whatsappNumbers.map((p) => p.normalized).filter(Boolean));
    acc.phones = acc.phones.filter((p) => !waSet.has(p.normalized));

    return { ok: true, error: errors.join('; '), pagesVisited, data: acc };
}