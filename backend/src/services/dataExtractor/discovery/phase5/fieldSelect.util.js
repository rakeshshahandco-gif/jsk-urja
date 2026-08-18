/**
 * Phase 5 — canonical field selection + provenance. Does not invent contacts.
 */
import { CONSUMER_EMAIL_DOMAINS } from '../phase2/constants.js';
import { collectEmails, collectPhones } from '../phase2/inputPayload.util.js';
import { normalizePhoneDigits } from '../mergeNormalize.service.js';
import {
    SOURCE_BADGES,
    SOURCE_STRENGTH,
    officialWebsiteOf,
    classifySourcePlatform,
    isSocialOrDirectoryHost,
} from './identityEvidence.util.js';

function strengthOf(platform) {
    return SOURCE_STRENGTH[platform] || SOURCE_STRENGTH.web;
}

function looksLegalName(name = '') {
    return /\b(pvt|private|ltd|limited|llp|inc|llc|company|industries|solutions|systems)\b/i.test(name);
}

export function selectCanonicalName(members = []) {
    const ranked = members
        .map((m) => ({
            name: String(m.companyName || m.title || '').trim(),
            platform: m.sourcePlatform || m.source || 'web',
            fromWebsite: !!officialWebsiteOf(m).domain,
        }))
        .filter((x) => x.name && x.name.length > 1)
        .sort((a, b) => {
            const sa = (a.fromWebsite ? 40 : 0) + strengthOf(a.platform) + (looksLegalName(a.name) ? 8 : 0);
            const sb = (b.fromWebsite ? 40 : 0) + strengthOf(b.platform) + (looksLegalName(b.name) ? 8 : 0);
            return sb - sa;
        });
    const canonical = ranked[0]?.name || '';
    const alternatives = [...new Set(ranked.map((r) => r.name).filter((n) => n !== canonical))].slice(0, 8);
    const winner = ranked[0];
    return {
        canonicalName: canonical,
        alternativeNames: alternatives,
        provenance: canonical ? {
            field: 'canonicalName',
            value: canonical,
            source: winner?.fromWebsite ? 'Official Website' : (SOURCE_BADGES[winner?.platform] || winner?.platform || 'web'),
            platform: winner?.platform || 'web',
        } : null,
    };
}

export function selectPrimaryWebsite(members = []) {
    for (const m of [...members].sort((a, b) => strengthOf(b.sourcePlatform) - strengthOf(a.sourcePlatform))) {
        const official = officialWebsiteOf(m);
        if (official.domain && !isSocialOrDirectoryHost(official.domain)) {
            return {
                website: official.website,
                domain: official.domain,
                provenance: {
                    field: 'website',
                    value: official.website,
                    source: 'Official Website',
                    platform: m.sourcePlatform || 'web',
                    evidenceUrl: m.sourceUrl || official.website,
                },
            };
        }
    }
    return { website: '', domain: '', provenance: null };
}

function emailRank(email, domain) {
    const e = String(email || '').toLowerCase();
    const host = e.split('@')[1] || '';
    if (CONSUMER_EMAIL_DOMAINS.includes(host)) return 1;
    let score = 10;
    if (domain && host === domain) score += 50;
    if (e.startsWith('sales@')) score += 40;
    else if (/^(enquiry|enquiries)@/.test(e)) score += 35;
    else if (e.startsWith('info@')) score += 30;
    else if (e.startsWith('contact@')) score += 25;
    else if (e.startsWith('office@')) score += 20;
    return score;
}

export function selectEmails(members = [], domain = '') {
    const byValue = new Map();
    for (const m of members) {
        const emails = collectEmails(m);
        for (const email of emails) {
            const key = email.toLowerCase();
            if (!byValue.has(key)) {
                byValue.set(key, { value: key, sources: [] });
            }
            byValue.get(key).sources.push({
                platform: m.sourcePlatform || m.source || 'web',
                evidenceUrl: m.sourceUrl || m.website || '',
            });
        }
    }
    const list = [...byValue.values()].sort((a, b) => emailRank(b.value, domain) - emailRank(a.value, domain));
    const primary = list[0]?.value || '';
    return {
        primaryEmail: primary,
        additionalEmails: list.filter((x) => x.value !== primary),
        allEmails: list,
        provenance: primary ? {
            field: 'primaryEmail',
            value: primary,
            source: list[0].sources[0]?.platform || 'web',
            evidenceUrl: list[0].sources[0]?.evidenceUrl || '',
        } : null,
    };
}

export function selectPhones(members = []) {
    const byValue = new Map();
    for (const m of members) {
        const phones = collectPhones(m);
        for (const phone of phones) {
            const digits = normalizePhoneDigits(phone);
            const key = digits.length >= 8 ? digits.slice(-10) : digits;
            if (!key) continue;
            if (!byValue.has(key)) {
                byValue.set(key, { value: phone, normalized: key, sources: [], count: 0 });
            }
            const row = byValue.get(key);
            row.count += 1;
            if (String(phone).length > String(row.value).length) row.value = phone;
            row.sources.push({
                platform: m.sourcePlatform || m.source || 'web',
                evidenceUrl: m.sourceUrl || m.website || '',
            });
        }
    }
    const list = [...byValue.values()].sort((a, b) => {
        const aWeb = a.sources.some((s) => s.platform === 'web' || s.evidenceUrl.includes(s.platform));
        const bWeb = b.sources.some((s) => s.platform === 'web');
        if (a.count !== b.count) return b.count - a.count;
        if (aWeb !== bWeb) return aWeb ? -1 : 1;
        return 0;
    });
    const primary = list[0]?.value || '';
    return {
        primaryPhone: primary,
        additionalPhones: list.filter((x) => x.value !== primary),
        allPhones: list,
        provenance: primary ? {
            field: 'primaryPhone',
            value: primary,
            source: list[0].sources[0]?.platform || 'web',
            evidenceUrl: list[0].sources[0]?.evidenceUrl || '',
        } : null,
    };
}

export function collectSocialAndDirectories(members = []) {
    const social = {
        facebookUrl: '',
        instagramUrl: '',
        linkedinCompanyUrl: '',
        linkedinProfessionalEvidence: [],
        xUrl: '',
        youtubeUrl: '',
    };
    const directories = [];
    for (const m of members) {
        const p = m.sourcePlatform || classifySourcePlatform(m);
        const url = m.sourceUrl || m.resultUrl || '';
        if (p === 'facebook' && !social.facebookUrl) social.facebookUrl = url;
        if (p === 'instagram' && !social.instagramUrl) social.instagramUrl = url;
        if (p === 'linkedin') {
            if (/\/in\//i.test(url)) social.linkedinProfessionalEvidence.push(url);
            else if (!social.linkedinCompanyUrl) social.linkedinCompanyUrl = url;
        }
        if (p === 'x' && !social.xUrl) social.xUrl = url;
        if (m.socialLinks?.youtube && !social.youtubeUrl) social.youtubeUrl = m.socialLinks.youtube;
        if (['indiamart', 'tradeindia', 'justdial', 'exportersindia', 'directory'].includes(p) && url) {
            directories.push({ kind: p, url });
        }
    }
    social.linkedinProfessionalEvidence = [...new Set(social.linkedinProfessionalEvidence)].slice(0, 8);
    const seenDir = new Set();
    const uniqueDirs = [];
    for (const d of directories) {
        const k = `${d.kind}|${d.url}`;
        if (seenDir.has(k)) continue;
        seenDir.add(k);
        uniqueDirs.push(d);
    }
    return { social, directories: uniqueDirs };
}

function extraEvidenceUrls(member = {}) {
    const fromRefs = Array.isArray(member.sourceRefs)
        ? member.sourceRefs.map((r) => r?.sourceUrl || r?.url)
        : [];
    const fromLinkedInEvidence = Array.isArray(member.social?.linkedinProfessionalEvidence)
        ? member.social.linkedinProfessionalEvidence
        : [];
    return [
        member.sourceUrl,
        member.resultUrl,
        member.social?.facebookUrl,
        member.socialLinks?.facebook,
        member.social?.instagramUrl,
        member.socialLinks?.instagram,
        member.social?.linkedinCompanyUrl,
        member.socialLinks?.linkedin,
        member.social?.xUrl,
        member.socialLinks?.twitter,
        member.socialLinks?.x,
        ...fromLinkedInEvidence,
        ...fromRefs,
    ].filter(Boolean);
}

export function countSourcePlatforms(members = []) {
    const platforms = new Set();
    let evidence = 0;
    for (const m of members) {
        evidence += Number(m.evidenceRecordCount || 1);
        const declared = m.sourcePlatform || m.source;
        if (declared) {
            platforms.add(classifySourcePlatform({ source: declared, sourcePlatform: declared }));
        }
        for (const url of extraEvidenceUrls(m)) {
            // URL-only so a Facebook member that also carries a LinkedIn URL counts both.
            platforms.add(classifySourcePlatform({ url }));
        }
        if (!declared && extraEvidenceUrls(m).length === 0) platforms.add('web');
    }
    platforms.delete('');
    return {
        sourcePlatformCount: platforms.size,
        evidenceRecordCount: evidence,
        platforms: [...platforms],
        badges: [...platforms].map((p) => SOURCE_BADGES[p] || String(p).toUpperCase()),
    };
}

export function verificationSummary(members = []) {
    let verifiedGenuine = 0;
    let humanReview = 0;
    let unverified = 0;
    for (const m of members) {
        const owner = String(m.ownerDecision || '').toLowerCase();
        const st = String(m.verificationStatus || '').toLowerCase();
        if (owner === 'verified_genuine' || st === 'verified_genuine' || st === 'owner_verified' || st === 'ai_verified_genuine') {
            verifiedGenuine += 1;
        } else if (owner === 'human_review_required' || st === 'human_review_required') {
            humanReview += 1;
        } else {
            unverified += 1;
        }
    }
    let status = 'Unverified';
    if (verifiedGenuine > 0 && (unverified > 0 || humanReview > 0)) status = 'Partially Verified';
    if (verifiedGenuine > 0 && unverified === 0 && humanReview === 0) status = 'Strongly Verified';
    if (verifiedGenuine > 0 && unverified > 0) status = 'Partially Verified';
    return { status, verifiedGenuine, unverified, humanReview };
}

export function completenessScore({ website, primaryEmail, primaryPhone, address, social } = {}) {
    const checks = [
        Boolean(website),
        Boolean(primaryEmail),
        Boolean(primaryPhone),
        Boolean(address),
        Boolean(social?.facebookUrl || social?.instagramUrl || social?.linkedinCompanyUrl || social?.xUrl),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function pickQualification(members = []) {
    let best = null;
    for (const m of members) {
        const q = m.qualification;
        if (!q || q.score == null) continue;
        const fromWeb = !!officialWebsiteOf(m).domain;
        const score = Number(q.score) + (fromWeb ? 5 : 0);
        if (!best || score > best._rank) best = { ...q, _rank: score };
    }
    if (!best) return { score: null, category: '', companyTypes: [], industryTags: [] };
    const { _rank, ...q } = best;
    void _rank;
    return q;
}

export function buildIdentityFromMembers(members = [], { mergeConfidence = 0, decision = 'keep_separate' } = {}) {
    const name = selectCanonicalName(members);
    const site = selectPrimaryWebsite(members);
    const emails = selectEmails(members, site.domain);
    const phones = selectPhones(members);
    const { social, directories } = collectSocialAndDirectories(members);
    const counts = countSourcePlatforms(members);
    const verify = verificationSummary(members);
    const qualification = pickQualification(members);
    const keywords = [...new Set(members.map((m) => m.keyword).filter(Boolean))];
    const locations = [...new Set(members.map((m) => m.location || m.city).filter(Boolean))];
    const runIds = [...new Set(members.map((m) => m.discoveryJobId || m.sessionId).filter(Boolean))];
    const first = members.map((m) => m.capturedAt).filter(Boolean).sort()[0] || null;
    const last = members.map((m) => m.lastSeenAt || m.capturedAt).filter(Boolean).sort().slice(-1)[0] || null;
    const provenance = [name.provenance, site.provenance, emails.provenance, phones.provenance].filter(Boolean);
    return {
        canonicalName: name.canonicalName,
        alternativeNames: name.alternativeNames,
        website: site.website,
        domain: site.domain,
        primaryEmail: emails.primaryEmail,
        additionalEmails: emails.additionalEmails,
        primaryPhone: phones.primaryPhone,
        additionalPhones: phones.additionalPhones,
        city: members.find((m) => m.city)?.city || '',
        state: members.find((m) => m.state)?.state || '',
        address: members.find((m) => m.address)?.address || '',
        social,
        directories,
        sourcePlatformCount: counts.sourcePlatformCount,
        evidenceRecordCount: counts.evidenceRecordCount,
        platforms: counts.platforms,
        badges: counts.badges,
        mergeConfidence,
        decision,
        verificationSummary: verify,
        qualificationScore: qualification.score ?? null,
        qualificationCategory: qualification.category || '',
        companyType: (qualification.companyTypes || [])[0] || '',
        industryTags: qualification.industryTags || [],
        keywords,
        locations,
        extractionRunIds: runIds.slice(0, 40),
        firstDiscoveredAt: first,
        lastDiscoveredAt: last,
        lastSeenAt: last,
        foundCount: members.length,
        completeness: completenessScore({
            website: site.website,
            primaryEmail: emails.primaryEmail,
            primaryPhone: phones.primaryPhone,
            address: members.find((m) => m.address)?.address || '',
            social,
        }),
        provenance,
        sourceRefs: members.map((m) => ({
            kind: m.kind,
            rawCaptureId: m.rawCaptureId || '',
            discoveryJobId: m.discoveryJobId || '',
            previewIndex: m.previewIndex,
            source: m.sourcePlatform || m.source,
            sourceUrl: m.sourceUrl || m.resultUrl || '',
            title: m.title || m.companyName || '',
            snippet: String(m.snippet || '').slice(0, 500),
            keyword: m.keyword || '',
            verificationStatus: m.verificationStatus || 'unverified',
            ownerDecision: m.ownerDecision || '',
            capturedAt: m.capturedAt || null,
        })),
        testOnly: false,
    };
}
