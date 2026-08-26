import { createHash } from 'crypto';
import { isDirectoryHost } from '../../searchCampaign/rawCaptureEnrichment/parse.util.js';
import { DIRECTORY_HOSTS } from '../../searchCampaign/rawCaptureEnrichment/constants.js';

const MAX_FIELD = 600;
const MAX_LIST_ITEMS = 8;

export function clipText(value, max = MAX_FIELD) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function uniqStrings(list = [], max = MAX_LIST_ITEMS) {
    const out = [];
    const seen = new Set();
    for (const item of list || []) {
        const s = clipText(item, 240);
        if (!s) continue;
        const key = s.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
        if (out.length >= max) break;
    }
    return out;
}

export function identityDomain(record = {}) {
    const domain = String(record.normalizedDomain || '').replace(/^www\./i, '').toLowerCase();
    const website = String(record.website || '');
    let host = domain;
    if (!host) {
        try {
            const u = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
            host = u.hostname.replace(/^www\./i, '').toLowerCase();
        } catch {
            host = '';
        }
    }
    if (!host) return '';
    if (isDirectoryHost(host) || DIRECTORY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return '';
    return host;
}

export function collectEmails(record = {}) {
    const raw = [
        record.email,
        ...(record.additionalEmails || []),
        ...(record.rawExtractedData?.emails || []).map((e) => e?.value || e),
        ...(record.rawExtractedData?.publicEmails || []).map((e) => e?.value || e?.normalized || e),
    ];
    return uniqStrings(raw.map((e) => String(e || '').trim().toLowerCase()).filter((e) => e.includes('@')), 12);
}

export function collectPhones(record = {}) {
    const raw = [
        record.phone,
        record.mobile,
        record.whatsappNumber,
        ...(record.additionalPhones || []),
        ...(record.rawExtractedData?.phones || []).map((p) => p?.original || p?.normalized || p),
        ...(record.rawExtractedData?.publicPhones || []).map((p) => p?.original || p?.normalized || p?.value || p),
    ];
    return uniqStrings(raw.map((p) => String(p || '').trim()).filter(Boolean), 12);
}

export function collectSourceUrls(record = {}) {
    return uniqStrings([
        record.sourceUrl,
        record.website,
        ...(record.rawExtractedData?.sourceUrls || []),
        ...(record.rawExtractedData?.pagesCrawled || []),
        record.rawExtractedData?.emailSourceUrl,
        record.rawExtractedData?.phoneSourceUrl,
        ...(record.evidenceUrls || []),
    ], 20);
}

export function collectSourceProviders(record = {}) {
    return uniqStrings([
        record.rawExtractedData?.sourceProvider,
        record.sourcePlatform,
        ...(record.rawExtractedData?.sourceProviders || []),
    ], 12);
}

function socialUrls(record = {}) {
    const s = record.socialLinks || {};
    return {
        facebook: clipText(s.facebook, 200),
        instagram: clipText(s.instagram, 200),
        linkedin: clipText(s.linkedin, 200),
        twitter: clipText(s.twitter, 200),
        youtube: clipText(s.youtube, 200),
    };
}

/**
 * Compact evidence blob for AI. Never includes CRM master data or raw HTML.
 */
export function buildQualificationInput({ job = {}, record = {} } = {}) {
    const payload = {
        searchKeyword: clipText(job.keyword, 200),
        location: clipText([job.city, job.state, job.country].filter(Boolean).join(', '), 120),
        generatedSearchQuery: clipText(record.rawExtractedData?.searchQuery || record.searchQuery, 240),
        companyName: clipText(record.companyName, 160),
        website: clipText(record.website, 200),
        domain: clipText(identityDomain(record) || record.normalizedDomain, 120),
        businessDescription: clipText(record.businessDescription, MAX_FIELD),
        aboutUsText: clipText(record.aboutPageText || record.rawExtractedData?.aboutText, MAX_FIELD),
        productServiceText: clipText(record.productPageText || record.rawExtractedData?.productText, MAX_FIELD),
        title: clipText(record.websiteTitle || record.pageTitle || record.title, 200),
        metaDescription: clipText(record.websiteMetaDescription || record.metaDescription, 300),
        directoryDescription: clipText(record.indiamartDescription || record.rawExtractedData?.directoryDescription, 400),
        categories: uniqStrings([
            ...(record.productCategories || []),
            ...(record.indiamartCategories || []),
            ...(record.keywords || []),
        ], 8),
        socialUrls: socialUrls(record),
        sourceSnippets: uniqStrings([
            record.snippet,
            record.searchSnippet,
            record.rawExtractedData?.snippet,
        ], 4),
        contactPageEvidence: clipText(record.rawExtractedData?.contactPageText, 300),
        pageTitles: uniqStrings(record.rawExtractedData?.pageTitles || [], 6),
        city: clipText(record.city, 80),
        state: clipText(record.stateProvince || record.state, 80),
        country: clipText(record.country, 80),
        sourceProviders: collectSourceProviders(record),
        hasEmail: collectEmails(record).length > 0,
        hasPhone: collectPhones(record).length > 0,
        isDirectoryListing: !!record.rawExtractedData?.isDirectory,
    };
    const json = JSON.stringify(payload);
    const inputHash = createHash('sha256').update(json).digest('hex').slice(0, 20);
    return { payload, inputHash };
}

export function evidenceCorpus(payload = {}) {
    return [
        payload.companyName,
        payload.website,
        payload.domain,
        payload.businessDescription,
        payload.aboutUsText,
        payload.productServiceText,
        payload.title,
        payload.metaDescription,
        payload.directoryDescription,
        ...(payload.categories || []),
        ...(payload.sourceSnippets || []),
        payload.contactPageEvidence,
        ...(payload.pageTitles || []),
        payload.city,
        payload.state,
    ].filter(Boolean).join(' \n ').toLowerCase();
}
