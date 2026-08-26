/**
 * Phase 5 — map source records to identity evidence without mutating RawCapture.
 * testOnly records are excluded from genuine consolidation.
 */
import { isDirectoryHost } from '../../searchCampaign/rawCaptureEnrichment/parse.util.js';
import { DIRECTORY_HOSTS } from '../../searchCampaign/rawCaptureEnrichment/constants.js';
import { identityDomain } from '../phase2/inputPayload.util.js';
import { normalizeDomain, normalizePhoneDigits, normalizeCompanyKey } from '../mergeNormalize.service.js';
import { NON_COMPANY_HOST_HINTS } from '../phase2/constants.js';

export const SOURCE_BADGES = Object.freeze({
    web: 'WEB',
    facebook: 'FB',
    instagram: 'IG',
    linkedin: 'LI',
    x: 'X',
    indiamart: 'INDIAMART',
    tradeindia: 'TRADEINDIA',
    justdial: 'JUSTDIAL',
    exportersindia: 'EXPINDIA',
    directory: 'DIRECTORY',
});

export const SOURCE_STRENGTH = Object.freeze({
    official_website: 100,
    linkedin: 80,
    facebook: 62,
    directory: 55,
    indiamart: 55,
    tradeindia: 52,
    justdial: 50,
    instagram: 45,
    x: 40,
    web: 30,
});

function hostOf(raw = '') {
    try {
        const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        return u.hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        return '';
    }
}

export function isTestOnlyRecord(rec = {}) {
    if (rec.testOnly === true) return true;
    const blob = [
        rec.notes,
        rec.snippet,
        rec.title,
        rec.companyName,
        JSON.stringify(rec.rawExtractedData || {}),
    ].join(' ');
    return /testOnly\s*=\s*true/i.test(blob) || /Phase 4C pipeline fixture/i.test(blob);
}

export function parseNotesMap(notes = '') {
    const out = {};
    String(notes || '').split(';').forEach((part) => {
        const i = part.indexOf('=');
        if (i < 1) return;
        const k = part.slice(0, i).trim();
        const v = part.slice(i + 1).trim();
        if (k) out[k] = v;
    });
    return out;
}

export function classifySourcePlatform({ source, sourcePlatform, url, provider } = {}) {
    const raw = String(sourcePlatform || source || provider || '').toLowerCase();
    const host = hostOf(url || '');
    if (raw.includes('facebook') || host.includes('facebook.com') || host === 'fb.com') return 'facebook';
    if (raw.includes('instagram') || host.includes('instagram.com')) return 'instagram';
    if (raw.includes('linkedin') || host.includes('linkedin.com')) return 'linkedin';
    if (raw === 'x' || raw.includes('twitter') || host === 'x.com' || host.includes('twitter.com')) return 'x';
    if (raw.includes('indiamart') || host.includes('indiamart')) return 'indiamart';
    if (raw.includes('tradeindia') || host.includes('tradeindia')) return 'tradeindia';
    if (raw.includes('justdial') || host.includes('justdial')) return 'justdial';
    if (raw.includes('exportersindia') || host.includes('exportersindia')) return 'exportersindia';
    if (raw.includes('directory') || isDirectoryHost(host) || DIRECTORY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
        return 'directory';
    }
    if (raw.includes('web') || raw.includes('google') || raw.includes('brave') || raw.includes('serp')) return 'web';
    return raw || 'web';
}

export function isSocialOrDirectoryHost(host = '') {
    const h = String(host || '').replace(/^www\./i, '').toLowerCase();
    if (!h) return true;
    if (isDirectoryHost(h) || DIRECTORY_HOSTS.some((d) => h === d || h.endsWith(`.${d}`))) return true;
    return NON_COMPANY_HOST_HINTS.some((hint) => h.includes(hint.replace(/\.$/, '')));
}

export function officialWebsiteOf(rec = {}) {
    const candidates = [
        rec.website,
        rec.officialWebsite,
        parseNotesMap(rec.notes).website,
        rec.rawExtractedData?.website,
    ].filter(Boolean);
    for (const c of candidates) {
        const host = hostOf(c) || normalizeDomain(c);
        if (host && !isSocialOrDirectoryHost(host)) {
            const href = /^https?:\/\//i.test(c) ? c : `https://${c}`;
            return { website: href, domain: host };
        }
    }
    const domain = identityDomain(rec);
    if (domain && !isSocialOrDirectoryHost(domain)) {
        return { website: `https://${domain}`, domain };
    }
    return { website: '', domain: '' };
}

export function normalizeEvidenceUrl(raw = '') {
    const s = String(raw || '').trim();
    if (!s) return '';
    try {
        const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
        u.hash = '';
        u.search = '';
        return u.toString().replace(/\/$/, '').toLowerCase();
    } catch {
        return s.toLowerCase();
    }
}

export function toPhase2Record(evidence = {}) {
    const official = officialWebsiteOf(evidence);
    return {
        companyName: evidence.companyName || evidence.title || '',
        website: official.website || evidence.website || '',
        normalizedDomain: official.domain || evidence.normalizedDomain || '',
        email: evidence.email || '',
        additionalEmails: evidence.additionalEmails || [],
        phone: evidence.phone || evidence.mobile || '',
        additionalPhones: evidence.additionalPhones || [],
        city: evidence.city || '',
        state: evidence.state || evidence.stateProvince || '',
        address: evidence.address || '',
        gstin: evidence.gstin || '',
        sourceUrl: evidence.sourceUrl || evidence.resultUrl || '',
        sourcePlatform: evidence.sourcePlatform || evidence.source || '',
        socialLinks: evidence.socialLinks || {},
        snippet: evidence.snippet || '',
        notes: evidence.notes || '',
        testOnly: evidence.testOnly === true,
        qualification: evidence.qualification || null,
        rawExtractedData: {
            ...(evidence.rawExtractedData || {}),
            sourceProvider: evidence.sourcePlatform || evidence.source || evidence.rawExtractedData?.sourceProvider,
            sourceProviders: [evidence.sourcePlatform || evidence.source].filter(Boolean),
            sourceUrls: [evidence.sourceUrl || evidence.resultUrl].filter(Boolean),
            isDirectory: ['indiamart', 'tradeindia', 'justdial', 'exportersindia', 'directory'].includes(evidence.sourcePlatform),
        },
    };
}

export function rawCaptureToEvidence(cap = {}, extra = {}) {
    if (isTestOnlyRecord({ ...cap, notes: cap.notes, snippet: cap.snippet })) return null;
    const notes = parseNotesMap(cap.notes);
    const url = cap.resultUrlNormalized || cap.resultUrlOriginal || cap.resultUrl || '';
    const platform = classifySourcePlatform({
        source: cap.source,
        url,
        provider: extra.provider,
    });
    const socialLinks = {};
    if (platform === 'facebook') socialLinks.facebook = url;
    if (platform === 'instagram') socialLinks.instagram = url;
    if (platform === 'linkedin') socialLinks.linkedin = url;
    if (platform === 'x') socialLinks.twitter = url;
    const emails = extra.emails || [];
    const phones = extra.phones || [];
    return {
        evidenceId: `raw:${cap._id || cap.id || url}`,
        kind: 'raw_capture',
        rawCaptureId: cap._id ? String(cap._id) : '',
        source: cap.source || platform,
        sourcePlatform: platform,
        companyName: cap.title || '',
        title: cap.title || '',
        snippet: cap.snippet || '',
        sourceUrl: url,
        resultUrl: url,
        website: notes.website || extra.website || '',
        email: emails[0] || '',
        additionalEmails: emails,
        phone: phones[0] || '',
        additionalPhones: phones,
        city: extra.city || notes.city || '',
        notes: cap.notes || '',
        keyword: notes.keyword || extra.keyword || '',
        location: notes.location || extra.location || '',
        campaignId: cap.campaignId ? String(cap.campaignId) : '',
        queryId: cap.queryId ? String(cap.queryId) : '',
        sessionId: extra.sessionId || '',
        capturedAt: cap.firstSeenAt || cap.createdAt || null,
        lastSeenAt: cap.lastSeenAt || cap.updatedAt || null,
        verificationStatus: extra.verificationStatus || 'unverified',
        ownerDecision: extra.ownerDecision || '',
        resultTypeHint: cap.resultTypeHint || '',
        socialLinks,
        testOnly: false,
        inboxStatus: cap.inboxStatus || '',
        enrichmentStatus: cap.enrichmentStatus || '',
        qualificationStatus: cap.qualificationStatus || '',
        promotedExtractedLeadId: cap.promotedExtractedLeadId || null,
        captureMethod: cap.captureMethod || '',
    };
}

export function previewRecordToEvidence(rec = {}, { jobId, previewIndex } = {}) {
    if (isTestOnlyRecord(rec)) return null;
    const url = rec.sourceUrl || rec.website || '';
    const platform = classifySourcePlatform({
        sourcePlatform: rec.sourcePlatform,
        url,
        provider: rec.rawExtractedData?.sourceProvider,
    });
    return {
        evidenceId: `preview:${jobId || 'job'}:${previewIndex ?? rec._previewIndex ?? 0}:${normalizeEvidenceUrl(url) || normalizeCompanyKey(rec.companyName)}`,
        kind: 'discovery_preview',
        discoveryJobId: jobId ? String(jobId) : String(rec.rawExtractedData?.discoveryJobId || ''),
        previewIndex: previewIndex ?? rec._previewIndex ?? null,
        source: platform,
        sourcePlatform: platform,
        companyName: rec.companyName || rec.title || '',
        title: rec.companyName || rec.title || '',
        snippet: rec.businessDescription || rec.snippet || '',
        sourceUrl: url,
        website: rec.website || '',
        normalizedDomain: rec.normalizedDomain || '',
        email: rec.email || '',
        additionalEmails: rec.additionalEmails || [],
        phone: rec.phone || rec.mobile || '',
        additionalPhones: rec.additionalPhones || [],
        city: rec.city || '',
        state: rec.stateProvince || rec.state || '',
        address: rec.address || '',
        gstin: rec.gstin || '',
        socialLinks: rec.socialLinks || {},
        notes: rec.notes || '',
        keyword: rec.rawExtractedData?.searchKeyword || rec.keywords?.[0] || '',
        location: [rec.city, rec.state].filter(Boolean).join(', '),
        qualification: rec.qualification || null,
        verificationStatus: rec.verificationStatus || 'unverified',
        capturedAt: rec.extractedAt || rec.createdAt || null,
        lastSeenAt: rec.updatedAt || rec.extractedAt || null,
        testOnly: false,
        rawExtractedData: rec.rawExtractedData || {},
        duplicateDisplayLabel: rec.duplicateDisplayLabel || '',
        phase2Merge: rec.phase2Merge || null,
    };
}

export function collapseUrlDuplicates(evidenceList = []) {
    const map = new Map();
    for (const ev of evidenceList) {
        if (!ev || isTestOnlyRecord(ev)) continue;
        const key = normalizeEvidenceUrl(ev.sourceUrl || ev.resultUrl) || ev.evidenceId;
        const prev = map.get(key);
        if (!prev) {
            map.set(key, { ...ev, evidenceRecordCount: 1 });
            continue;
        }
        prev.evidenceRecordCount = (prev.evidenceRecordCount || 1) + 1;
        prev.lastSeenAt = ev.lastSeenAt || prev.lastSeenAt;
        if (!prev.website && ev.website) prev.website = ev.website;
        if (!prev.email && ev.email) prev.email = ev.email;
        if (!prev.phone && ev.phone) prev.phone = ev.phone;
    }
    return [...map.values()];
}

export function blockingKeys(evidence = {}) {
    const rec = toPhase2Record(evidence);
    const name = normalizeCompanyKey(rec.companyName).slice(0, 8);
    const digits = normalizePhoneDigits(rec.phone);
    const phone = digits.length >= 8 ? digits.slice(-10) : '';
    const domain = rec.normalizedDomain || identityDomain(rec);
    return { name, phone, domain };
}
