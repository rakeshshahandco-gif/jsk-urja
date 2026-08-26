/**
 * Display-only parsing of stored RawCapture / identity fields.
 * Does not invent values. Does not change extraction or overwrite Instagram evidence.
 */
import {
    extractExternalWebsite,
    extractVisibleEmail,
    extractVisiblePhone,
} from './directLogin.quality.util.js';

export const EMPTY = '';

export function parseSocialNotes(notes = '') {
    const out = {};
    for (const part of String(notes || '').split(';')) {
        const idx = part.indexOf('=');
        if (idx < 1) continue;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (!key || !value) continue;
        if (out[key] == null) out[key] = value;
    }
    return out;
}

function usernameFromCapture(capture = {}) {
    const id = String(capture.sourceRecordId || '');
    const m = id.match(/^instagram:(.+)$/i);
    if (m?.[1]) return m[1].replace(/^@/, '');
    try {
        const u = new URL(String(capture.resultUrlNormalized || capture.resultUrlOriginal || ''));
        const handle = (u.pathname || '').split('/').filter(Boolean)[0] || '';
        if (handle && !['p', 'reel', 'reels', 'stories', 'explore'].includes(handle.toLowerCase())) {
            return handle;
        }
    } catch {
        /* ignore */
    }
    return '';
}

function firstGroup(text, re) {
    const m = String(text || '').match(re);
    return m ? String(m[1] || m[0]).trim() : '';
}

function visibleWebsiteFromText(text = '') {
    const fromUtil = extractExternalWebsite(text);
    if (fromUtil) return fromUtil;
    const token = firstGroup(String(text || ''), /\b((?:www\.)[a-z0-9][a-z0-9.-]+\.[a-z]{2,8})\b/i);
    if (!token) return '';
    const guess = token.startsWith('http') ? token : `https://${token}`;
    try {
        const host = new URL(guess).hostname.replace(/^www\./, '').toLowerCase();
        if (!host || /(instagram|facebook|fb|linkedin|twitter|x\.com|whatsapp|threads)\./i.test(host)) return '';
        return guess.split('?')[0];
    } catch {
        return '';
    }
}

function whatsappFromText(text = '') {
    const m = String(text || '').match(/https?:\/\/wa\.me\/[^\s,;]+/i)
        || String(text || '').match(/\bwa\.me\/\+?\d{8,15}\b/i);
    return m ? m[0].replace(/[),.;]+$/, '') : '';
}

function displayNameFromSnippet(snippet = '', handle = '', title = '') {
    let rest = String(snippet || '').trim();
    if (handle) {
        rest = rest.replace(new RegExp(`^@?${handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i'), '');
    }
    const beforeStats = rest.split(/\s+\d[\d,.]*[KkMm]?\s*posts\b/i)[0].trim();
    if (beforeStats && beforeStats.length >= 3 && beforeStats.length <= 90) {
        return beforeStats.slice(0, 200);
    }
    const lines = String(snippet || '')
        .split(/\n| · /)
        .map((l) => l.trim())
        .filter(Boolean);
    const skip = new Set([String(handle || '').toLowerCase(), `@${String(handle || '').toLowerCase()}`]);
    for (const line of lines) {
        const lower = line.toLowerCase();
        if (skip.has(lower)) continue;
        if (/^\d[\d,.]*[kKmM]?\s*(posts?|followers?|following)\b/i.test(line)) continue;
        if (/^(follow|message|followed by)\b/i.test(lower)) continue;
        if (/^website=/i.test(line)) continue;
        if (line.length >= 3 && line.length <= 90) return line.slice(0, 200);
    }
    const t = String(title || '').trim();
    if (t && t.toLowerCase() !== String(handle || '').toLowerCase()) return t;
    return t;
}

function categoryFromText(text = '') {
    const product = String(text || '').match(/\bProduct\/service(?:\s*•\s*[A-Za-z][A-Za-z /-]{0,40})?/i);
    if (product) return product[0].trim();
    const service = String(text || '').match(/\bAutomation Service\b/i);
    if (service) return service[0].trim();
    const other = String(text || '').match(/\b(Digital creator|Professional account|Personal blog|Home goods store)\b/i);
    return other ? other[0].trim() : '';
}

function addressFromSnippet(snippet = '') {
    const text = String(snippet || '');
    const afterMore = text.match(/\bmore\s+([A-Z][A-Za-z0-9 .,'-]{6,90}?\d{6})\b/);
    if (afterMore) return afterMore[1].trim();
    const pin = text.match(/\b([A-Z][A-Za-z0-9 .,'-]{6,90}?\d{6})\b/);
    return pin ? pin[1].trim() : '';
}

function cityFromSnippet(snippet = '') {
    const text = String(snippet || '');
    const withCountry = text.match(/\b([A-Za-z][A-Za-z .]{2,40}),\s*India\b/);
    if (withCountry) return withCountry[1].trim();
    const withPin = text.match(/\b([A-Za-z][A-Za-z .]{2,40})\s+\d{6}\b/);
    if (withPin) return withPin[1].replace(/^(Road|Rd|Street|Bridge)\s+/i, '').trim();
    return '';
}

function countryFromSnippet(snippet = '') {
    if (/\bIndia\b/i.test(snippet || '')) return 'India';
    return '';
}

function isBusinessHint(text = '') {
    return /\b(product\/service|professional|business|automation service|manufacturer|digital creator)\b/i.test(text);
}

function websiteEnrichedFromNotes(notesMap = {}) {
    const crawl = String(notesMap.websiteCrawl || '').toLowerCase();
    if (!crawl) {
        return {
            ran: false,
            status: 'not_started',
            companyName: '',
            website: '',
            email: '',
            phone: '',
            address: '',
            city: '',
            state: '',
            country: '',
            description: '',
        };
    }
    return {
        ran: true,
        status: crawl === 'ok' ? 'ok' : crawl,
        companyName: '',
        website: notesMap.website || '',
        email: notesMap.emails || '',
        phone: notesMap.phones || '',
        address: '',
        city: crawl === 'ok' ? (notesMap.city || '') : '',
        state: '',
        country: '',
        description: '',
    };
}

export const EXPORT_HEADERS = [
    'Company Name',
    'Instagram Username',
    'Instagram URL',
    'Description',
    'Category',
    'Website',
    'Website Source',
    'Email',
    'Email Source',
    'Phone',
    'Phone Source',
    'WhatsApp',
    'Address',
    'City',
    'State',
    'Country',
    'Search Keyword',
    'Search Location',
    'Source',
    'Qualification',
    'Verification',
    'CRM Status',
    'Captured Date',
    'RawCapture ID',
    'Enrichment Status',
];

function websiteEnrichedFromDoc(doc = null, notesMap = {}) {
    const fromNotes = websiteEnrichedFromNotes(notesMap);
    if (!doc) return fromNotes;
    const emails = (doc.emails || []).map((e) => e?.value || e).filter(Boolean).join(', ');
    const phones = (doc.phones || []).map((p) => p?.original || p?.normalized || p).filter(Boolean).join(', ');
    const address = (doc.addresses || []).map((a) => a?.raw).filter(Boolean).join(' | ');
    const products = (doc.productsServices || []).filter(Boolean).join('; ');
    return {
        ran: true,
        status: doc.enrichmentStatus || fromNotes.status || '',
        companyName: doc.companyName || '',
        website: doc.websiteUrl || '',
        email: emails,
        phone: phones,
        address,
        city: doc.city || '',
        state: doc.state || '',
        country: doc.country || '',
        description: products,
        pagesVisited: doc.pagesVisited || [],
    };
}

export function presentSocialCapture(capture = {}, identity = null, sessionByCampaign = {}, enrichmentDoc = null) {
    const notesMap = parseSocialNotes(capture.notes);
    const handle = usernameFromCapture(capture);
    const snippet = String(capture.snippet || '');
    const igWebsite = notesMap.website || visibleWebsiteFromText(snippet);
    const igEmail = extractVisibleEmail(snippet);
    const igPhone = extractVisiblePhone(snippet);
    const igWa = whatsappFromText(snippet);
    const igCity = cityFromSnippet(snippet);
    const igAddress = addressFromSnippet(snippet);
    const igCountry = countryFromSnippet(snippet);
    const displayName = displayNameFromSnippet(snippet, handle, capture.title);
    const category = categoryFromText(snippet);
    const websiteEnriched = websiteEnrichedFromDoc(enrichmentDoc, notesMap);
    const campaignId = String(capture.campaignId || '');
    const sessionId = sessionByCampaign[campaignId] || '';

    const qualificationBits = [
        identity?.qualificationCategory || '',
        identity?.qualificationScore != null && identity.qualificationScore !== '' ? String(identity.qualificationScore) : '',
    ].filter(Boolean);
    const verification = identity?.verificationSummary?.status
        || identity?.sourceRefs?.find((r) => String(r.rawCaptureId) === String(capture._id))?.verificationStatus
        || '';
    const crm = identity?.crmStatus
        || (capture.promotedExtractedLeadId ? 'Lead' : '');

    const instagram = {
        profileName: displayName || capture.title || handle,
        username: handle,
        profileUrl: capture.resultUrlNormalized || capture.resultUrlOriginal || notesMap.evidenceUrl || '',
        displayName,
        businessCategory: category,
        bio: snippet,
        city: igCity,
        address: igAddress,
        phone: igPhone,
        email: igEmail,
        website: igWebsite,
        whatsapp: igWa,
        otherContact: igWa && igPhone && igWa.includes(igPhone.replace(/\D/g, '').slice(-10)) ? '' : '',
        followers: firstGroup(snippet, /([\d,.]+[KkMm]?)\s*followers/i),
        following: firstGroup(snippet, /([\d,.]+[KkMm]?)\s*following/i),
        posts: firstGroup(snippet, /([\d,.]+[KkMm]?)\s*posts/i),
        businessAccount: isBusinessHint(snippet) ? 'Yes (visible on profile)' : '',
        source: 'Instagram',
        searchKeyword: notesMap.keyword || '',
        searchLocation: notesMap.location || '',
        searchType: notesMap.searchType || '',
        sourceEvidence: snippet,
        originalSourceUrl: notesMap.evidenceUrl || capture.resultUrlOriginal || capture.resultUrlNormalized || '',
        capturedAt: notesMap.extractedAt || capture.lastSeenAt || capture.createdAt || '',
        websiteSource: igWebsite ? 'Instagram' : '',
        phoneSource: igPhone ? 'Instagram' : '',
        emailSource: igEmail ? 'Instagram' : '',
    };

    const workflow = {
        processing: capture.inboxStatus || '',
        enrichment: capture.enrichmentStatus || '',
        enrichmentEligible: capture.enrichmentEligible === true,
        qualification: capture.qualificationStatus || '',
        qualificationLabel: qualificationBits.join(' · ') || capture.qualificationStatus || '',
        verification: verification || 'Unverified',
        consolidation: identity ? 'Consolidated' : 'Not consolidated',
        crm: crm || 'New',
        identityId: identity?._id ? String(identity._id) : '',
        sessionId,
        campaignId,
        queryId: String(capture.queryId || ''),
        captureMethod: capture.captureMethod || '',
        resultTypeHint: capture.resultTypeHint || '',
        seenCount: capture.seenCount || 1,
    };

    return {
        rawCaptureId: String(capture._id || ''),
        instagram,
        websiteEnriched,
        workflow,
        facebook: identity?.social?.facebookUrl || '',
        linkedin: identity?.social?.linkedinCompanyUrl || identity?.social?.linkedinUrl || '',
        x: identity?.social?.xUrl || identity?.social?.twitterUrl || '',
        notes: String(capture.notes || ''),
    };
}

export function exportRowFromPresented(row) {
    const ig = row.instagram || {};
    const web = row.websiteEnriched || {};
    const wf = row.workflow || {};
    const crawled = web.ran && ['ok', 'completed', 'partial'].includes(String(web.status || ''));
    const website = ig.website || (crawled ? web.website : '');
    const websiteSource = ig.website ? 'Instagram' : (website ? 'company website' : '');
    const email = ig.email || (crawled ? web.email : '');
    const emailSource = ig.email ? 'Instagram' : (email ? 'company website' : '');
    const phone = ig.phone || (crawled ? web.phone : '');
    const phoneSource = ig.phone ? 'Instagram' : (phone ? 'company website' : '');
    const captured = ig.capturedAt ? new Date(ig.capturedAt).toISOString() : '';
    return [
        ig.profileName || '',
        ig.username || '',
        ig.profileUrl || '',
        ig.bio || '',
        ig.businessCategory || '',
        website,
        websiteSource,
        email,
        emailSource,
        phone,
        phoneSource,
        ig.whatsapp || '',
        ig.address || web.address || '',
        ig.city || (crawled ? web.city : ''),
        web.state || '',
        ig.country || web.country || '',
        ig.searchKeyword || '',
        ig.searchLocation || '',
        ig.source || 'Instagram',
        wf.qualificationLabel || '',
        wf.verification || '',
        wf.crm || '',
        captured,
        row.rawCaptureId || '',
        wf.enrichment || '',
    ];
}

export function pickIdentityForCapture(identities = [], capture = {}) {
    const url = String(capture.resultUrlNormalized || capture.resultUrlOriginal || '').toLowerCase();
    const id = String(capture._id || '');
    const matches = (identities || []).filter((ident) => {
        const ig = String(ident.social?.instagramUrl || '').toLowerCase();
        if (url && ig && ig.replace(/\/$/, '') === url.replace(/\/$/, '')) return true;
        return (ident.sourceRefs || []).some((ref) => String(ref.sourceUrl || '').toLowerCase().replace(/\/$/, '') === url.replace(/\/$/, ''));
    });
    const byRef = matches.find((ident) => (ident.sourceRefs || []).some((ref) => String(ref.rawCaptureId) === id));
    if (byRef) return byRef;
    return matches.sort((a, b) => new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0))[0] || null;
}
