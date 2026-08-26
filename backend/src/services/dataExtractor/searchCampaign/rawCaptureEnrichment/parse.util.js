/**
 * Checkpoint 6A — parse public HTML for enrichment (no invention).
 */
import {
    extractEmailsFromText,
    extractJsonLdBlocks,
    extractOrgFromJsonLd,
    extractPhonesFromText,
    extractProductsFromHtml,
    parseMetaDescription,
    parseTitleFromHtml,
} from '../../extractor.utils.js';
import { CONTACT_PATH_HINTS, DIRECTORY_HOSTS, SOCIAL_HOSTS } from './constants.js';
import { extractLabeledAddressesFromHtml, mergeAddressLists } from './addressExtract.util.js';
import {
    extractCopyrightName,
    extractOgSiteName,
    isGenericSeoCompanyTitle,
    resolveCanonicalCompanyName,
} from '../simpleLeadSearch/entityClassification.util.js';

export function normalizeDomain(hostOrUrl) {
    const raw = String(hostOrUrl || '').trim().toLowerCase();
    if (!raw) return '';
    try {
        const u = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
        return u.hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        return raw.replace(/^www\./i, '').split('/')[0];
    }
}

export function isDirectoryHost(domain) {
    const d = normalizeDomain(domain);
    return DIRECTORY_HOSTS.some((h) => d === h || d.endsWith(`.${h}`));
}

export function classifyEmailKind(email) {
    const local = String(email || '').split('@')[0] || '';
    if (/sales|order/i.test(local)) return 'sales';
    if (/enquir|inquir|info|hello|contact/i.test(local)) return 'enquiry';
    if (/support|helpdesk|care/i.test(local)) return 'support';
    if (/\./.test(local) && !/info|sales|support|admin|office/.test(local)) return 'personal_business';
    return 'general';
}

export const PHONE_CONFIDENCE = Object.freeze({
    TEL_LINK: 'verified_from_tel_link',
    STRUCTURED: 'verified_from_structured_data',
    LABELLED: 'visible_labelled_phone',
    POSSIBLE: 'possible_phone',
    REJECTED: 'rejected_invalid',
});

export function isTollFree(original) {
    const d = String(original || '').replace(/\D/g, '');
    return /^1800|^1860/.test(d) || /toll[\s-]?free/i.test(String(original || ''));
}

/** Reject prices, years, decimals, pin codes, CSS fragments, and junk digit runs. */
export function isRejectedPhoneShape(value) {
    const original = String(value || '').trim();
    if (!original) return true;
    if (/[a-z]/i.test(original)) return true;
    if (/\d+\.\d+/.test(original)) return true; // decimals / coordinates / prices
    if (/[₹$€£]|rs\.?|inr|usd|price|amount/i.test(original)) return true;
    const digits = original.replace(/\D/g, '');
    if (!digits) return true;
    if (digits.length < 10 || digits.length > 15) return true;
    if (/^(19|20)\d{2}$/.test(digits)) return true; // years
    if (digits.length === 6) return true; // pin-code shaped
    if (/^0+$/.test(digits) || /^1+$/.test(digits) || /^(\d)\1{9,}$/.test(digits)) return true;
    return false;
}

/**
 * India-focused acceptance:
 * - mobile: 10 digits starting 6-9 (+91 optional)
 * - toll-free: 1800/1860...
 * - landline: 0 + STD (2-4) + subscriber, or +91 with total 10-13 national digits after 91
 */
export function classifyIndianPhone(value) {
    const original = String(value || '').trim();
    if (isRejectedPhoneShape(original)) {
        return { ok: false, confidence: PHONE_CONFIDENCE.REJECTED, kind: 'unknown', normalized: '', reason: 'invalid_shape' };
    }
    let digits = original.replace(/\D/g, '');
    if (digits.startsWith('91') && digits.length >= 12) digits = digits.slice(2);
    if (digits.startsWith('0') && digits.length >= 11) {
        // keep leading 0 for landline detection below
    }

    if (isTollFree(original) || /^1800|^1860/.test(digits)) {
        const norm = digits.startsWith('91') ? `+${digits}` : (digits.length >= 10 ? `+91${digits.replace(/^0/, '')}` : '');
        return {
            ok: true,
            confidence: PHONE_CONFIDENCE.POSSIBLE,
            kind: 'toll_free',
            normalized: norm || `+91${digits}`,
            reason: 'toll_free',
        };
    }

    // Mobile: exactly 10 digits, start 6-9
    const national = digits.startsWith('0') ? digits.slice(1) : digits;
    if (/^[6-9]\d{9}$/.test(national)) {
        return {
            ok: true,
            confidence: PHONE_CONFIDENCE.POSSIBLE,
            kind: 'mobile',
            normalized: `+91${national}`,
            reason: 'india_mobile',
        };
    }

    // Landline: 0 + STD(2-4) + rest => total 10-11 digits with leading 0
    if (/^0[1-9]\d{8,10}$/.test(digits)) {
        return {
            ok: true,
            confidence: PHONE_CONFIDENCE.POSSIBLE,
            kind: 'general',
            normalized: `+91${digits.slice(1)}`,
            reason: 'india_landline',
        };
    }

    // +91 landline without trunk 0: 10 national digits starting 1-5 (STD codes)
    if (/^[1-5]\d{9}$/.test(national)) {
        return {
            ok: true,
            confidence: PHONE_CONFIDENCE.POSSIBLE,
            kind: 'general',
            normalized: `+91${national}`,
            reason: 'india_landline_std',
        };
    }

    return { ok: false, confidence: PHONE_CONFIDENCE.REJECTED, kind: 'unknown', normalized: '', reason: 'not_india_structure' };
}

export function isPlausiblePhone(value) {
    return classifyIndianPhone(value).ok;
}

export function normalizePhoneDigits(value) {
    return classifyIndianPhone(value).normalized || '';
}

export function buildPhoneRecord(original, pageUrl, confidence, extra = {}) {
    const classified = classifyIndianPhone(original);
    if (!classified.ok && confidence !== PHONE_CONFIDENCE.TEL_LINK && confidence !== PHONE_CONFIDENCE.STRUCTURED) {
        return {
            original: String(original || '').slice(0, 80),
            normalized: '',
            kind: 'unknown',
            sourceUrl: pageUrl || '',
            labelledWhatsApp: false,
            confidence: PHONE_CONFIDENCE.REJECTED,
            originalText: String(extra.originalText || original || '').slice(0, 200),
            reviewRequired: true,
            rejectReason: classified.reason || 'rejected',
        };
    }
    const norm = classified.normalized || normalizePhoneDigits(original);
    const conf = confidence || classified.confidence;
    const accepted = [
        PHONE_CONFIDENCE.TEL_LINK,
        PHONE_CONFIDENCE.STRUCTURED,
        PHONE_CONFIDENCE.LABELLED,
    ].includes(conf) && Boolean(norm);
    return {
        original: String(original || '').slice(0, 80),
        normalized: norm,
        kind: extra.kind || classified.kind || 'unknown',
        sourceUrl: pageUrl || '',
        labelledWhatsApp: Boolean(extra.labelledWhatsApp),
        confidence: accepted ? conf : (norm ? PHONE_CONFIDENCE.POSSIBLE : PHONE_CONFIDENCE.REJECTED),
        originalText: String(extra.originalText || original || '').slice(0, 200),
        reviewRequired: !accepted,
        rejectReason: accepted ? '' : (classified.reason || ''),
    };
}

export function acceptPhoneForStorage(phone) {
    if (!phone) return false;
    if (phone.confidence === PHONE_CONFIDENCE.REJECTED) return false;
    if (!phone.normalized) return false;
    return [
        PHONE_CONFIDENCE.TEL_LINK,
        PHONE_CONFIDENCE.STRUCTURED,
        PHONE_CONFIDENCE.LABELLED,
    ].includes(phone.confidence);
}

function hostMatches(url, hosts) {
    try {
        const h = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
        return hosts.some((x) => h === x || h.endsWith(`.${x}`));
    } catch {
        return false;
    }
}

export function extractSocialLinks(html, pageUrl) {
    const out = { facebook: null, instagram: null, linkedin: null, youtube: null, twitter: null, whatsappLinks: [] };
    const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
    let m;
    const htmlStr = String(html || '');
    while ((m = hrefRe.exec(htmlStr)) !== null) {
        let href = m[1].trim();
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
        try {
            href = new URL(href, pageUrl || 'https://example.com').href;
        } catch {
            continue;
        }
        if (hostMatches(href, SOCIAL_HOSTS.facebook) && !/\/sharer|\/share\.php|\/dialog\/|\/plugins\//i.test(href)) {
            if (!out.facebook) {
                const parsed = parseSocialIdentity('facebook', href);
                out.facebook = {
                    url: parsed.profileUrl || href,
                    handle: parsed.handle,
                    pageId: parsed.pageId,
                    pageName: parsed.pageName,
                    sourceUrl: pageUrl,
                    matchConfidence: 'verified',
                    evidence: ['official website link'],
                };
            }
        } else if (hostMatches(href, SOCIAL_HOSTS.instagram) && !/\/reel\/|\/p\//i.test(href)) {
            if (!out.instagram) {
                const parsed = parseSocialIdentity('instagram', href);
                out.instagram = {
                    url: parsed.profileUrl || href,
                    handle: parsed.handle,
                    pageId: '',
                    pageName: parsed.pageName,
                    sourceUrl: pageUrl,
                    matchConfidence: 'verified',
                    evidence: ['official website link'],
                };
            }
        } else if (hostMatches(href, SOCIAL_HOSTS.linkedin) && /linkedin\.com\/(company|in|school)\//i.test(href)) {
            if (!out.linkedin) {
                const parsed = parseSocialIdentity('linkedin', href);
                out.linkedin = {
                    url: parsed.profileUrl || href,
                    handle: parsed.handle,
                    pageId: '',
                    pageName: parsed.pageName,
                    sourceUrl: pageUrl,
                    matchConfidence: 'verified',
                    evidence: ['official website link'],
                };
            }
        } else if (hostMatches(href, SOCIAL_HOSTS.twitter || []) && !/\/intent\/|\/share/i.test(href)) {
            if (!out.twitter) {
                out.twitter = {
                    url: href,
                    handle: '',
                    pageId: '',
                    pageName: '',
                    sourceUrl: pageUrl,
                    matchConfidence: 'verified',
                    evidence: ['official website link'],
                };
            }
        } else if (hostMatches(href, SOCIAL_HOSTS.youtube) && !/\/watch|\/shorts\//i.test(href) && !/youtube\.com\/@user\/?$/i.test(href) && !/youtube\.com\/user\/?$/i.test(href)) {
            if (!out.youtube) {
                const parsed = parseSocialIdentity('youtube', href);
                out.youtube = {
                    url: parsed.profileUrl || href,
                    handle: parsed.handle,
                    pageId: parsed.pageId,
                    pageName: parsed.pageName,
                    sourceUrl: pageUrl,
                    matchConfidence: 'verified',
                    evidence: ['official website link'],
                };
            }
        } else if (hostMatches(href, SOCIAL_HOSTS.whatsapp) || /wa\.me\//i.test(href)) {
            out.whatsappLinks.push(href);
        }
    }
    return out;
}

export function parseSocialIdentity(network, url) {
    const empty = { handle: '', pageId: '', pageName: '', profileUrl: String(url || '') };
    try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        if (network === 'facebook') {
            if (u.pathname.includes('profile.php')) {
                const id = u.searchParams.get('id') || '';
                return { handle: id ? `id:${id}` : '', pageId: id, pageName: '', profileUrl: u.href };
            }
            const handle = parts.find((p) => !['pages', 'people', 'public'].includes(p.toLowerCase())) || parts[parts.length - 1] || '';
            return { handle, pageId: '', pageName: handle, profileUrl: `https://www.facebook.com/${handle}` };
        }
        if (network === 'instagram') {
            const handle = parts[0] || '';
            return { handle, pageId: '', pageName: handle, profileUrl: handle ? `https://www.instagram.com/${handle}/` : u.href };
        }
        if (network === 'linkedin') {
            const idx = parts.findIndex((p) => ['company', 'in', 'school'].includes(p));
            const handle = idx >= 0 ? (parts[idx + 1] || '') : (parts[parts.length - 1] || '');
            return { handle, pageId: '', pageName: handle, profileUrl: u.href };
        }
        if (network === 'youtube') {
            if (parts[0] === 'channel' && parts[1]) {
                return { handle: '', pageId: parts[1], pageName: parts[1], profileUrl: u.href };
            }
            const handle = (parts[0] || '').replace(/^@/, '');
            return { handle, pageId: '', pageName: handle, profileUrl: handle ? `https://www.youtube.com/@${handle}` : u.href };
        }
        return empty;
    } catch {
        return empty;
    }
}

function extractHandle(url) {
    return parseSocialIdentity('facebook', url).handle;
}

export function extractMailtoAndTel(html, pageUrl) {
    const emails = [];
    const phones = [];
    const mailtoRe = /href\s*=\s*["']mailto:([^"'?]+)/gi;
    const telRe = /href\s*=\s*["']tel:([^"']+)/gi;
    let m;
    const s = String(html || '');
    while ((m = mailtoRe.exec(s)) !== null) {
        const value = decodeURIComponent(m[1]).trim().toLowerCase();
        if (value.includes('@')) emails.push({ value, kind: classifyEmailKind(value), sourceUrl: pageUrl });
    }
    while ((m = telRe.exec(s)) !== null) {
        const original = decodeURIComponent(m[1]).trim();
        phones.push(buildPhoneRecord(original, pageUrl, PHONE_CONFIDENCE.TEL_LINK, {
            originalText: `tel:${original}`,
        }));
    }
    return { emails, phones };
}

export function extractWhatsAppFromHtml(html, pageUrl, whatsappLinks = []) {
    const found = [];
    for (const link of whatsappLinks) {
        const numMatch = String(link).match(/(?:wa\.me\/|phone=)(\+?\d{8,15})/i);
        if (!numMatch) continue;
        const original = numMatch[1];
        const rec = buildPhoneRecord(original, pageUrl, PHONE_CONFIDENCE.TEL_LINK, {
            kind: 'whatsapp',
            labelledWhatsApp: true,
            originalText: link,
        });
        if (acceptPhoneForStorage(rec) || rec.normalized) {
            rec.kind = 'whatsapp';
            rec.labelledWhatsApp = true;
            rec.confidence = PHONE_CONFIDENCE.TEL_LINK;
            rec.reviewRequired = false;
            found.push(rec);
        }
    }
    const labelRe = /whatsapp[^0-9+]{0,40}(\+?\d[\d\s().-]{7,}\d)/gi;
    let m;
    const s = String(html || '');
    while ((m = labelRe.exec(s)) !== null) {
        const original = m[1].trim();
        const rec = buildPhoneRecord(original, pageUrl, PHONE_CONFIDENCE.LABELLED, {
            kind: 'whatsapp',
            labelledWhatsApp: true,
            originalText: m[0],
        });
        if (acceptPhoneForStorage(rec)) {
            rec.kind = 'whatsapp';
            rec.labelledWhatsApp = true;
            found.push(rec);
        }
    }
    return dedupePhones(found).filter((p) => p.labelledWhatsApp && p.normalized);
}

export function extractContactPersons(html, pageUrl) {
    // Only capture when designation keywords appear near a capitalized name (no email inference).
    const people = [];
    const text = String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ');
    const re = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s*[,|–—-]?\s*(Director|Managing Director|MD|CEO|Founder|Proprietor|Partner|Manager|Sales Manager|Marketing Manager|Owner)\b/g;
    let m;
    while ((m = re.exec(text)) !== null && people.length < 5) {
        people.push({ name: m[1].trim(), designation: m[2].trim(), sourceUrl: pageUrl });
    }
    return people;
}

export function classifyBusinessType(textBlob, pageUrl = '') {
    if (pageUrl && isDirectoryHost(pageUrl)) {
        return { businessType: 'marketplace_directory', manufacturerEvidence: 'directory / marketplace host' };
    }
    const t = String(textBlob || '').toLowerCase();
    const evidence = [];
    if (/\b(manufactur(?:er|ers|ing)?|factory|plant|oem|odm|production\s+unit)s?\b/.test(t)) {
        evidence.push('manufacturing language on page');
        if (/\boem\b|\bodm\b/.test(t)) return { businessType: 'oem_odm', manufacturerEvidence: evidence.join('; ') };
        return { businessType: 'manufacturer', manufacturerEvidence: evidence.join('; ') };
    }
    if (/\b(system integrator|automation solution|turnkey)\b/.test(t)) {
        return { businessType: 'system_integrator', manufacturerEvidence: '' };
    }
    if (/\b(distributor|distribution)\b/.test(t)) return { businessType: 'distributor', manufacturerEvidence: '' };
    if (/\b(dealer|dealership)\b/.test(t)) return { businessType: 'dealer', manufacturerEvidence: '' };
    if (/\b(supplier|wholesale)\b/.test(t)) return { businessType: 'supplier', manufacturerEvidence: '' };
    if (/\b(service provider|maintenance|amc)\b/.test(t)) return { businessType: 'service_provider', manufacturerEvidence: '' };
    if (/\b(marketplace|directory|b2b portal)\b/.test(t)) return { businessType: 'marketplace_directory', manufacturerEvidence: '' };
    return { businessType: 'unknown', manufacturerEvidence: '' };
}

export function discoverCandidatePaths(html, baseUrl) {
    const found = [];
    const aRe = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    const s = String(html || '');
    const textHints = ['关于我们', '公司简介', '联系我们', '联系方式', '产品中心', '产品展示', '工厂', '资质', '证书'];
    while ((m = aRe.exec(s)) !== null) {
        let href = m[1].trim();
        const label = String(m[2] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
        try {
            const abs = new URL(href, baseUrl);
            const path = abs.pathname.toLowerCase();
            const pathHit = CONTACT_PATH_HINTS.some((h) => path.includes(h.replace(/^\//, '')) || path === h);
            const textHit = textHints.some((t) => label.includes(t.toLowerCase()));
            if (pathHit || textHit) {
                found.push(abs.origin + abs.pathname);
            }
        } catch {
            /* ignore */
        }
    }
    return [...new Set(found)].slice(0, 8);
}

export function dedupePhones(list) {
    const seen = new Set();
    const out = [];
    for (const p of list || []) {
        const key = p.normalized || p.original;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(p);
    }
    return out;
}

export function dedupeEmails(list) {
    const seen = new Set();
    const out = [];
    for (const e of list || []) {
        const key = e.value;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(e);
    }
    return out;
}

export function extractLabelledPhones(html, pageUrl) {
    const text = String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ');
    const found = [];
    const re = /(?:phone|mobile|contact|call\s*us|tel|telephone|helpline)\s*[:\-–]?\s*(\+?\d[\d\s().-]{8,}\d)/gi;
    let m;
    while ((m = re.exec(text)) !== null && found.length < 10) {
        const original = m[1].trim();
        found.push(buildPhoneRecord(original, pageUrl, PHONE_CONFIDENCE.LABELLED, {
            originalText: m[0].slice(0, 200),
        }));
    }
    return found;
}

export function extractGstin(html, pageUrl) {
    const m = String(html || '').match(/\b(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9])\b/i);
    if (!m) return { value: '', sourceUrl: '' };
    return { value: m[1].toUpperCase(), sourceUrl: pageUrl };
}

export function parsePageBundle(html, pageUrl) {
    const title = parseTitleFromHtml(html);
    const description = parseMetaDescription(html);
    const jsonLd = extractOrgFromJsonLd(extractJsonLdBlocks(html));
    const products = extractProductsFromHtml(html);
    const { emails: mailtoEmails, phones: telPhones } = extractMailtoAndTel(html, pageUrl);
    const textEmails = extractEmailsFromText(html).map((value) => ({
        value,
        kind: classifyEmailKind(value),
        sourceUrl: pageUrl,
    }));

    const structuredPhones = [];
    if (jsonLd?.telephone) {
        const vals = Array.isArray(jsonLd.telephone) ? jsonLd.telephone : [jsonLd.telephone];
        for (const v of vals) {
            structuredPhones.push(buildPhoneRecord(String(v), pageUrl, PHONE_CONFIDENCE.STRUCTURED, {
                originalText: `jsonld:${v}`,
            }));
        }
    }

    const labelledPhones = extractLabelledPhones(html, pageUrl);
    // Do NOT use loose unlabelled digit scraping — it caused invalid owner-visible values.
    const rejectedPhones = [];
    const looseCandidates = extractPhonesFromText(html).slice(0, 30);
    for (const original of looseCandidates) {
        const rec = buildPhoneRecord(original, pageUrl, PHONE_CONFIDENCE.POSSIBLE, { originalText: original });
        if (!acceptPhoneForStorage(rec)) {
            rejectedPhones.push({
                original: rec.original,
                confidence: PHONE_CONFIDENCE.REJECTED,
                reason: rec.rejectReason || 'unlabelled_or_invalid',
                sourceUrl: pageUrl,
            });
        }
    }

    const phones = dedupePhones(
        [...telPhones, ...structuredPhones, ...labelledPhones].filter(acceptPhoneForStorage),
    );
    const social = extractSocialLinks(html, pageUrl);
    const whatsappNumbers = extractWhatsAppFromHtml(html, pageUrl, social.whatsappLinks);
    const contactPersons = extractContactPersons(html, pageUrl);
    const gstin = extractGstin(html, pageUrl);
    const textBlob = [title, description, html.slice(0, 50000)].join(' ');
    const business = classifyBusinessType(textBlob, pageUrl);

    const addr = jsonLd?.address;
    const jsonLdAddresses = [];
    if (addr) {
        const street = typeof addr === 'string'
            ? addr
            : [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode, addr.addressCountry].filter(Boolean).join(', ');
        if (street) {
            jsonLdAddresses.push({
                raw: street,
                city: typeof addr === 'object' ? (addr.addressLocality || '') : '',
                state: typeof addr === 'object' ? (addr.addressRegion || '') : '',
                country: typeof addr === 'object' ? (String(addr.addressCountry?.name || addr.addressCountry || '')) : '',
                pinCode: typeof addr === 'object' ? String(addr.postalCode || '') : '',
                type: 'Office',
                evidenceLabel: 'JSON-LD PostalAddress',
                confidence: 'high',
                sourceUrl: pageUrl,
            });
        }
    }
    const labeledAddresses = extractLabeledAddressesFromHtml(html, pageUrl);
    const addresses = mergeAddressLists(jsonLdAddresses, labeledAddresses);

    const companyName = jsonLd?.name || jsonLd?.legalName || '';
    const ogSiteName = extractOgSiteName(html);
    const copyrightName = extractCopyrightName(html);
    const resolved = resolveCanonicalCompanyName({
        jsonLdName: jsonLd?.name || '',
        legalName: jsonLd?.legalName || '',
        ogSiteName,
        copyrightName,
        googleTitle: title,
        isDirectory: Boolean(pageUrl && isDirectoryHost(pageUrl)),
    });
    const evidence = [];
    if (resolved.name) {
        evidence.push({ field: 'companyName', value: resolved.name, sourceUrl: pageUrl, note: resolved.evidence });
    } else if (companyName && !isGenericSeoCompanyTitle(companyName)) {
        evidence.push({ field: 'companyName', value: companyName, sourceUrl: pageUrl, note: 'json-ld or org' });
    } else if (title && !isGenericSeoCompanyTitle(title)) {
        evidence.push({ field: 'companyName', value: title.split('|')[0].split('-')[0].trim(), sourceUrl: pageUrl, note: 'page title (preliminary)' });
    }
    for (const ph of phones) {
        evidence.push({
            field: 'phone',
            value: ph.normalized || ph.original,
            sourceUrl: ph.sourceUrl || pageUrl,
            note: `${ph.confidence}; original=${ph.originalText || ph.original}`,
        });
    }
    for (const net of ['facebook', 'instagram', 'linkedin', 'youtube', 'twitter']) {
        if (social[net]?.url) {
            evidence.push({
                field: net,
                value: social[net].handle ? `@${social[net].handle}` : social[net].url,
                sourceUrl: social[net].sourceUrl || pageUrl,
                note: `match=${social[net].matchConfidence || 'verified'}; url=${social[net].url}`,
            });
        }
    }
    if (gstin.value) {
        evidence.push({ field: 'gstin', value: gstin.value, sourceUrl: gstin.sourceUrl, note: 'public page text' });
    }

    return {
        title,
        description,
        companyName: resolved.name || (companyName && !isGenericSeoCompanyTitle(companyName) ? companyName : ''),
        legalOrDisplayedName: jsonLd?.legalName || resolved.name || companyName || '',
        canonicalCompanyName: resolved.name || '',
        companyEntityConfidence: resolved.confidence || '',
        companyNameEvidence: resolved.evidence || '',
        emails: dedupeEmails([...mailtoEmails, ...textEmails]),
        phones,
        rejectedPhones: rejectedPhones.slice(0, 20),
        whatsappNumbers,
        addresses,
        city: addresses[0]?.city || '',
        state: addresses[0]?.state || '',
        country: addresses[0]?.country || '',
        social,
        productsServices: products.slice(0, 20),
        contactPersons,
        businessType: business.businessType,
        manufacturerEvidence: business.manufacturerEvidence,
        gstin: gstin.value || '',
        gstinSourceUrl: gstin.sourceUrl || '',
        evidence,
        candidatePaths: discoverCandidatePaths(html, pageUrl),
    };
}

export function scoreEnrichmentConfidence(doc) {
    let score = 0;
    if (doc.companyName) score += 20;
    if (doc.emails?.length) score += 20;
    if (doc.phones?.length) score += 15;
    if (doc.whatsappNumbers?.length) score += 10;
    if (doc.city || doc.addresses?.length) score += 10;
    if (doc.facebook?.url || doc.instagram?.url) score += 10;
    if (doc.contactPersons?.length) score += 10;
    if (doc.businessType && doc.businessType !== 'unknown') score += 5;
    return Math.min(100, score);
}

export function computeMissingFields(doc) {
    const missing = [];
    if (!doc.companyName) missing.push('companyName');
    if (!doc.phones?.length) missing.push('phone');
    if (!doc.emails?.length) missing.push('email');
    if (!doc.whatsappNumbers?.length) missing.push('whatsapp');
    if (!doc.city) missing.push('city');
    if (!doc.facebook?.url) missing.push('facebook');
    if (!doc.instagram?.url) missing.push('instagram');
    if (!doc.contactPersons?.length) missing.push('contactPerson');
    return missing;
}