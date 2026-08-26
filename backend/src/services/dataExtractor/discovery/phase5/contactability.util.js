/**
 * Contactability is deterministic and separate from AI relevance.
 * Missing contact fields stay empty. Nothing is invented.
 */
import {
    facebookMemberDisplay,
    sourceKindLabel,
} from '../../socialSources/facebookGroupProspect.util.js';

export const OUTREACH_STATUSES = Object.freeze([
    'Not Contacted',
    'Ready to Contact',
    'Contacted',
    'WhatsApp Sent',
    'Email Sent',
    'Called',
    'Facebook Profile Opened',
    'Instagram Profile Opened',
    'Follow-up Required',
    'Interested',
    'Not Interested',
    'No Response',
    'Invalid Contact',
    'Do Not Contact',
    'Converted to Lead',
]);

const CONSUMER_EMAIL_RE = /@(gmail|yahoo|hotmail|outlook|rediffmail|icloud)\./i;
const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

export function digitsPhone(raw = '') {
    const d = String(raw || '').replace(/\D/g, '');
    if (d.length >= 12 && d.startsWith('91')) return d.slice(-10);
    if (d.length >= 10) return d.slice(-10);
    return d;
}

export function isOfficialWebsite(url = '') {
    const s = String(url || '').trim();
    if (!s) return false;
    try {
        const host = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.replace(/^www\./i, '').toLowerCase();
        if (!host) return false;
        return !/(facebook|fb|instagram|linkedin|x\.com|twitter|youtube|indiamart|justdial|tradeindia)\./i.test(host)
            && !/facebook\.com|instagram\.com|linkedin\.com/.test(host);
    } catch {
        return false;
    }
}

export function isFacebookGroupDiscoveryUrl(url = '') {
    const u = String(url || '');
    return /facebook\.com\/groups\//i.test(u) && !/\/user\//i.test(u);
}

export function isNoiseSocialUrl(url = '') {
    const u = String(url || '').toLowerCase();
    return /instagram\.com\/(explore|popular|accounts|reels|reel|p|stories)\b/.test(u)
        || /facebook\.com\/(photo|watch|login|search|share|posts)\b/.test(u);
}

function collectUrls(ident = {}) {
    return [
        ident.social?.facebookUrl,
        ident.social?.instagramUrl,
        ident.social?.linkedinCompanyUrl,
        ident.social?.xUrl,
        ident.website,
        ...(ident.sourceRefs || []).map((r) => r.sourceUrl || r.resultUrl),
    ].filter(Boolean);
}

export function isDirectoryProspectUrl(url = '') {
    const u = String(url || '').toLowerCase();
    return /indiamart\.com|tradeindia\.com|justdial\.com|exportersindia\.com|dial4trade\.com|yellowpages\.co\.in/.test(u);
}

export function isDiscoveryOnly(ident = {}) {
    const phone = String(ident.primaryPhone || '').trim();
    const email = String(ident.primaryEmail || '').trim();
    const website = isOfficialWebsite(ident.website) ? ident.website : '';
    const hasUsable = Boolean(phone || email || website);
    const urls = collectUrls(ident);
    if (urls.some(isFacebookGroupDiscoveryUrl) && !hasUsable) return true;
    if (urls.some(isNoiseSocialUrl) && !hasUsable) return true;
    if (urls.some(isDirectoryProspectUrl) && !website) return true;
    return false;
}

export function whatsappNumber(ident = {}) {
    const d = digitsPhone(ident.primaryPhone || ident.whatsappNumber || '');
    if (INDIAN_MOBILE_RE.test(d)) return d;
    return '';
}

export function scoreContactability(ident = {}) {
    const phone = String(ident.primaryPhone || '').trim();
    const email = String(ident.primaryEmail || '').trim();
    const wa = whatsappNumber(ident);
    const website = isOfficialWebsite(ident.website);
    const fb = String(ident.social?.facebookUrl || '').trim() && !isFacebookGroupDiscoveryUrl(ident.social?.facebookUrl);
    const ig = String(ident.social?.instagramUrl || '').trim() && !isNoiseSocialUrl(ident.social?.instagramUrl);
    const li = String(ident.social?.linkedinCompanyUrl || '').trim();
    let score = 0;
    if (phone) score += 35;
    if (wa) score += 15;
    if (email) score += CONSUMER_EMAIL_RE.test(email) ? 18 : 30;
    if (website) score += 15;
    if (fb) score += 8;
    if (ig) score += 8;
    if (li) score += 8;
    return Math.min(100, score);
}

export function bestContactChannel(ident = {}) {
    const wa = whatsappNumber(ident);
    const phone = String(ident.primaryPhone || '').trim();
    const email = String(ident.primaryEmail || '').trim();
    const website = isOfficialWebsite(ident.website);
    const ig = String(ident.social?.instagramUrl || '').trim() && !isNoiseSocialUrl(ident.social?.instagramUrl);
    const fb = String(ident.social?.facebookUrl || '').trim();
    const li = String(ident.social?.linkedinCompanyUrl || '').trim();
    if (wa && phone) return 'WhatsApp / Call';
    if (wa) return 'WhatsApp';
    if (phone) return 'Call';
    if (email) return 'Email';
    if (website) return 'Website';
    if (ig) return 'Instagram Profile';
    if (fb && !isFacebookGroupDiscoveryUrl(fb)) return 'Facebook';
    if (li) return 'LinkedIn';
    if (fb) return 'Facebook group (source only)';
    return 'None';
}

export function outreachPriority(ident = {}, contactability = 0) {
    const cat = String(ident.qualificationCategory || '').toLowerCase();
    const highly = cat.includes('highly');
    const relevant = highly || cat === 'relevant';
    const strong = contactability >= 50;
    const socialOnly = contactability > 0 && contactability < 50;
    if (highly && strong) return 'A';
    if (highly && socialOnly) return 'B';
    if (relevant && strong) return 'C';
    return 'D';
}

export function parsePersonEvidence(ident = {}) {
    const stored = ident.contactPerson || ident.outreach?.contactPerson || {};
    if (stored.name) {
        return {
            name: String(stored.name || ''),
            designation: String(stored.designation || ''),
            evidenceUrl: String(stored.evidenceUrl || ''),
        };
    }
    for (const ref of ident.sourceRefs || []) {
        const blob = `${ref.snippet || ''} ${ref.title || ''}`;
        const person = (blob.match(/personEvidence=([^;]+)/i) || [])[1];
        if (person) {
            return {
                name: person.trim(),
                designation: ((blob.match(/director|founder|owner|manager|ceo/i) || [])[0] || '').trim(),
                evidenceUrl: ref.sourceUrl || '',
            };
        }
    }
    return { name: '', designation: '', evidenceUrl: '' };
}

export function presentContactableProspect(ident = {}) {
    const contactability = scoreContactability(ident);
    const discoveryOnly = isDiscoveryOnly(ident);
    const person = parsePersonEvidence(ident);
    const fbMember = facebookMemberDisplay(ident, person);
    const outreach = ident.outreach || {};
    const status = outreach.doNotContact
        ? 'Do Not Contact'
        : (ident.crmStatus === 'Converted to Lead' ? 'Converted to Lead' : (outreach.status || 'Not Contacted'));
    const channels = {
        phone: String(ident.primaryPhone || '').trim(),
        additionalPhones: ident.additionalPhones || [],
        whatsapp: whatsappNumber(ident),
        email: String(ident.primaryEmail || '').trim(),
        additionalEmails: ident.additionalEmails || [],
        website: isOfficialWebsite(ident.website) ? ident.website : '',
        facebook: String(ident.social?.facebookUrl || '').trim(),
        instagram: String(ident.social?.instagramUrl || '').trim(),
        linkedin: String(ident.social?.linkedinCompanyUrl || '').trim(),
        x: String(ident.social?.xUrl || '').trim(),
    };
    return {
        id: String(ident._id || ''),
        companyName: ident.canonicalName || '',
        contactPersonName: fbMember.sourceKind === 'facebook_group_member'
            ? (fbMember.memberName || person.name)
            : person.name,
        designation: person.designation || ident.contactPerson?.designation || '',
        businessType: ident.companyType || '',
        industry: (ident.industryTags || []).join(', '),
        city: ident.city || '',
        state: ident.state || '',
        country: ident.country || '',
        ...channels,
        hasPhone: Boolean(channels.phone),
        hasWhatsApp: Boolean(channels.whatsapp),
        hasEmail: Boolean(channels.email),
        hasWebsite: Boolean(channels.website),
        hasFacebook: Boolean(channels.facebook) && !isFacebookGroupDiscoveryUrl(channels.facebook),
        hasInstagram: Boolean(channels.instagram) && !isNoiseSocialUrl(channels.instagram),
        facebookIsGroupSource: isFacebookGroupDiscoveryUrl(channels.facebook),
        facebookProfileUrl: fbMember.facebookProfileUrl || channels.facebook,
        sourceKind: fbMember.sourceKind,
        sourceLabel: sourceKindLabel(fbMember.sourceKind),
        parentGroup: fbMember.parentGroup,
        parentGroupId: fbMember.parentGroupId,
        reviewStatus: fbMember.reviewStatus,
        sources: ident.platforms || [],
        sourcePlatformCount: ident.sourcePlatformCount || (ident.platforms || []).length,
        relevanceScore: ident.qualificationScore == null ? null : Number(ident.qualificationScore),
        qualification: ident.qualificationCategory || '',
        verification: ident.verificationSummary?.status || 'Unverified',
        crmStatus: ident.crmStatus || 'New',
        contactability,
        bestChannel: bestContactChannel(ident),
        priority: outreachPriority(ident, contactability),
        discoveryOnly,
        outreachStatus: status,
        doNotContact: outreach.doNotContact === true,
        outreachLog: outreach.log || [],
        evidence: (ident.sourceRefs || []).slice(0, 8).map((r) => ({
            source: r.source || r.kind,
            title: r.title,
            url: r.sourceUrl,
        })),
        keywords: ident.keywords || [],
        promotedExtractedLeadId: ident.promotedExtractedLeadId || null,
    };
}
