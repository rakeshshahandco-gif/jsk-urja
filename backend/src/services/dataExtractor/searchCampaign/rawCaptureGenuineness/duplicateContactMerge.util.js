/**
 * Merge unique contact details for confirmed same-company duplicate groups.
 * Presentation/export only — does not mutate RawCapture or enrichment documents.
 */
import { isDirectoryHost, normalizeDomain } from '../rawCaptureEnrichment/parse.util.js';
import { buildWebsiteIdentityKey, isHostedPlatformHostname } from './websiteIdentity.util.js';

const PHONE_CONF_RANK = {
    verified_from_tel_link: 5,
    verified_from_structured_data: 4,
    visible_labelled_phone: 3,
    possible_phone: 2,
    rejected_invalid: 0,
    '': 1,
};

/** Normalize Indian-centric phone for equality (+91XXXXXXXXXX). */
export function normalizePhoneKey(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    let digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('91') && digits.length >= 12) digits = digits.slice(-10);
    if (digits.startsWith('0') && digits.length >= 11) digits = digits.slice(1);
    if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
    if (/^[1-5]\d{9}$/.test(digits)) return `+91${digits}`;
    if (digits.length >= 10) return `+91${digits.slice(-10)}`;
    return digits;
}

export function displayPhone(value, normalized) {
    const norm = normalized || normalizePhoneKey(value);
    if (/^\+91\d{10}$/.test(norm)) return norm.slice(3); // readable 10-digit national
    return String(value || norm || '').trim();
}

export function normalizeEmailKey(value) {
    return String(value || '').trim().toLowerCase();
}

export function normalizeWebsiteKey(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const u = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
        const host = u.hostname.replace(/^www\./i, '').toLowerCase();
        if (isDirectoryHost(host) || isHostedPlatformHostname(host)) {
            return buildWebsiteIdentityKey(raw, { isDirectory: isDirectoryHost(host) });
        }
        // Official websites: hostname only (ignore path/query/fragment)
        return host;
    } catch {
        return normalizeDomain(raw);
    }
}

export function normalizeSocialKey(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const u = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
        const host = u.hostname.replace(/^www\./i, '').toLowerCase();
        const path = u.pathname.replace(/\/+$/, '').toLowerCase();
        return `${host}${path}`;
    } catch {
        return raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
    }
}

function pushUnique(map, key, entry) {
    if (!key) return;
    if (!map.has(key)) {
        map.set(key, entry);
        return;
    }
    const prev = map.get(key);
    // Prefer richer evidence / higher confidence / newer verified
    const prevRank = PHONE_CONF_RANK[prev.confidence || ''] ?? 1;
    const nextRank = PHONE_CONF_RANK[entry.confidence || ''] ?? 1;
    if (nextRank > prevRank) {
        map.set(key, { ...prev, ...entry, firstCapturedAt: prev.firstCapturedAt || entry.firstCapturedAt });
        return;
    }
    map.set(key, {
        ...prev,
        sourceUrl: prev.sourceUrl || entry.sourceUrl,
        evidenceType: prev.evidenceType || entry.evidenceType,
        lastVerifiedAt: entry.lastVerifiedAt || prev.lastVerifiedAt,
        verifiedAt: entry.verifiedAt || prev.verifiedAt,
    });
}

function phoneEntriesFromEnrichment(en) {
    const out = [];
    for (const p of (en?.phones || [])) {
        const key = normalizePhoneKey(p.normalized || p.original || p.value);
        if (!key) continue;
        out.push({
            key,
            value: displayPhone(p.original || p.value, p.normalized || key),
            normalizedValue: key,
            sourceUrl: p.sourceUrl || '',
            evidenceType: p.confidence || 'phone',
            confidence: p.confidence || '',
            kind: p.kind || 'phone',
            firstCapturedAt: en?.createdAt || null,
            lastVerifiedAt: en?.lastEnrichedAt || en?.updatedAt || null,
            verifiedAt: en?.lastEnrichedAt || null,
        });
    }
    return out;
}

function whatsappEntriesFromEnrichment(en) {
    const out = [];
    for (const p of (en?.whatsappNumbers || [])) {
        const key = normalizePhoneKey(p.normalized || p.original || p.value);
        if (!key) continue;
        out.push({
            key,
            value: displayPhone(p.original || p.value, p.normalized || key),
            normalizedValue: key,
            sourceUrl: p.sourceUrl || '',
            evidenceType: p.confidence || 'whatsapp',
            confidence: p.confidence || '',
            kind: 'whatsapp',
            firstCapturedAt: en?.createdAt || null,
            lastVerifiedAt: en?.lastEnrichedAt || en?.updatedAt || null,
            verifiedAt: en?.lastEnrichedAt || null,
        });
    }
    return out;
}

function emailEntriesFromEnrichment(en) {
    const out = [];
    for (const e of (en?.emails || [])) {
        const raw = typeof e === 'string' ? e : (e?.value || e?.address || '');
        const key = normalizeEmailKey(raw);
        if (!key || !key.includes('@')) continue;
        out.push({
            key,
            value: String(raw).trim(),
            normalizedValue: key,
            sourceUrl: (typeof e === 'object' && e?.sourceUrl) || '',
            evidenceType: (typeof e === 'object' && e?.kind) || 'email',
            kind: (typeof e === 'object' && e?.kind) || 'general',
            firstCapturedAt: en?.createdAt || null,
            lastVerifiedAt: en?.lastEnrichedAt || en?.updatedAt || null,
            verifiedAt: en?.lastEnrichedAt || null,
        });
    }
    return out;
}

function contactEntriesFromEnrichment(en) {
    const out = [];
    for (const c of (en?.contactPersons || [])) {
        const name = String(c?.name || '').trim();
        if (!name) continue;
        const designation = String(c?.designation || '').trim();
        const key = `${name.toLowerCase()}|${designation.toLowerCase()}`;
        out.push({
            key,
            value: name,
            designation,
            normalizedValue: key,
            sourceUrl: c?.sourceUrl || '',
            evidenceType: 'contact_person',
            firstCapturedAt: en?.createdAt || null,
            lastVerifiedAt: en?.lastEnrichedAt || en?.updatedAt || null,
            verifiedAt: en?.lastEnrichedAt || null,
        });
    }
    return out;
}

function addressEntriesFromEnrichment(en) {
    const out = [];
    for (const a of (en?.addresses || [])) {
        const raw = String(a?.raw || [a?.city, a?.state, a?.country].filter(Boolean).join(', ') || '').trim();
        if (!raw) continue;
        const key = raw.toLowerCase().replace(/\s+/g, ' ');
        out.push({
            key,
            value: raw,
            normalizedValue: key,
            city: a?.city || en?.city || '',
            state: a?.state || en?.state || '',
            country: a?.country || en?.country || '',
            sourceUrl: a?.sourceUrl || '',
            evidenceType: 'address',
            firstCapturedAt: en?.createdAt || null,
            lastVerifiedAt: en?.lastEnrichedAt || en?.updatedAt || null,
            verifiedAt: en?.lastEnrichedAt || null,
        });
    }
    if (!out.length && (en?.city || en?.state)) {
        const raw = [en.city, en.state, en.country].filter(Boolean).join(', ');
        const key = raw.toLowerCase();
        out.push({
            key,
            value: raw,
            normalizedValue: key,
            city: en.city || '',
            state: en.state || '',
            country: en.country || '',
            sourceUrl: en.websiteUrl || '',
            evidenceType: 'location_fields',
            firstCapturedAt: en?.createdAt || null,
            lastVerifiedAt: en?.lastEnrichedAt || null,
            verifiedAt: en?.lastEnrichedAt || null,
        });
    }
    return out;
}

function socialEntriesFromEnrichment(en, network) {
    const s = en?.[network];
    if (!s?.url) return [];
    const key = normalizeSocialKey(s.url);
    if (!key) return [];
    return [{
        key,
        value: s.url,
        normalizedValue: key,
        handle: s.handle || '',
        sourceUrl: s.sourceUrl || s.url,
        evidenceType: network,
        firstCapturedAt: en?.createdAt || null,
        lastVerifiedAt: en?.lastEnrichedAt || en?.updatedAt || null,
        verifiedAt: en?.lastEnrichedAt || null,
    }];
}

function productEntriesFromEnrichment(en) {
    const out = [];
    for (const p of (en?.productsServices || [])) {
        const value = String(p || '').trim();
        if (!value) continue;
        const key = value.toLowerCase();
        out.push({
            key,
            value,
            normalizedValue: key,
            sourceUrl: en?.websiteUrl || '',
            evidenceType: 'product',
            firstCapturedAt: en?.createdAt || null,
            lastVerifiedAt: en?.lastEnrichedAt || null,
            verifiedAt: en?.lastEnrichedAt || null,
        });
    }
    return out;
}

function websiteEntriesFromEnrichment(en) {
    const urls = [en?.websiteUrl, en?.directoryProfileUrl].filter(Boolean);
    const out = [];
    for (const url of urls) {
        const key = normalizeWebsiteKey(url);
        if (!key) continue;
        out.push({
            key,
            value: String(url).trim(),
            normalizedValue: key,
            sourceUrl: url,
            evidenceType: 'website',
            firstCapturedAt: en?.createdAt || null,
            lastVerifiedAt: en?.lastEnrichedAt || null,
            verifiedAt: en?.lastEnrichedAt || null,
        });
    }
    return out;
}

function rankPrimary(entries) {
    if (!entries.length) return null;
    const scored = entries.map((e, idx) => {
        let score = 0;
        const url = String(e.sourceUrl || '').toLowerCase();
        if (/\/(contact|about|support)/i.test(url)) score += 50;
        if (e.evidenceType === 'verified_from_tel_link' || e.evidenceType === 'verified_from_structured_data') score += 40;
        if (e.evidenceType === 'visible_labelled_phone') score += 30;
        if (e.kind === 'sales' || e.kind === 'enquiry') score += 10;
        if (e.lastVerifiedAt) score += 5;
        score += (PHONE_CONF_RANK[e.confidence || ''] || 0);
        return { e, score, idx };
    });
    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
    return scored[0].e;
}

function finalizeField(entries) {
    const list = [...entries];
    const primary = rankPrimary(list);
    const additional = primary ? list.filter((e) => e.key !== primary.key) : list.slice(1);
    return {
        primary: primary || null,
        all: list,
        additional,
        primaryValue: primary?.value || '',
        allValuesJoined: list.map((e) => e.value).filter(Boolean).join(', '),
        shortDisplay: primary
            ? (additional.length ? `${primary.value} +${additional.length} more` : primary.value)
            : '',
    };
}

/**
 * Merge contacts from one or more enrichment docs (already confirmed same company).
 * Returns structured arrays — originals are not mutated.
 */
export function mergeContactsForDuplicateGroup(enrichmentRecords = []) {
    const phoneMap = new Map();
    const waMap = new Map();
    const emailMap = new Map();
    const contactMap = new Map();
    const addressMap = new Map();
    const websiteMap = new Map();
    const facebookMap = new Map();
    const instagramMap = new Map();
    const linkedinMap = new Map();
    const productMap = new Map();
    const sourceEnrichmentIds = [];

    for (const en of enrichmentRecords || []) {
        if (!en) continue;
        if (en._id) sourceEnrichmentIds.push(String(en._id));
        for (const e of phoneEntriesFromEnrichment(en)) pushUnique(phoneMap, e.key, e);
        for (const e of whatsappEntriesFromEnrichment(en)) pushUnique(waMap, e.key, e);
        for (const e of emailEntriesFromEnrichment(en)) pushUnique(emailMap, e.key, e);
        for (const e of contactEntriesFromEnrichment(en)) pushUnique(contactMap, e.key, e);
        for (const e of addressEntriesFromEnrichment(en)) pushUnique(addressMap, e.key, e);
        for (const e of websiteEntriesFromEnrichment(en)) pushUnique(websiteMap, e.key, e);
        for (const e of socialEntriesFromEnrichment(en, 'facebook')) pushUnique(facebookMap, e.key, e);
        for (const e of socialEntriesFromEnrichment(en, 'instagram')) pushUnique(instagramMap, e.key, e);
        for (const e of socialEntriesFromEnrichment(en, 'linkedin')) pushUnique(linkedinMap, e.key, e);
        for (const e of productEntriesFromEnrichment(en)) pushUnique(productMap, e.key, e);
    }

    const phones = finalizeField([...phoneMap.values()]);
    const whatsapp = finalizeField([...waMap.values()]);
    const emails = finalizeField([...emailMap.values()]);
    const contacts = finalizeField([...contactMap.values()]);
    const addresses = finalizeField([...addressMap.values()]);
    const websites = finalizeField([...websiteMap.values()]);
    const facebook = finalizeField([...facebookMap.values()]);
    const instagram = finalizeField([...instagramMap.values()]);
    const linkedin = finalizeField([...linkedinMap.values()]);
    const products = finalizeField([...productMap.values()]);

    return {
        sourceEnrichmentIds: [...new Set(sourceEnrichmentIds)],
        phones,
        whatsapp,
        emails,
        contacts,
        addresses,
        websites,
        facebook,
        instagram,
        linkedin,
        products,
        // convenience for API/UI
        contactSummary: {
            primaryPhone: phones.primaryValue,
            additionalPhones: phones.additional.map((e) => e.value),
            phonesShort: phones.shortDisplay,
            phonesAll: phones.all,
            primaryWhatsApp: whatsapp.primaryValue,
            additionalWhatsApp: whatsapp.additional.map((e) => e.value),
            whatsappShort: whatsapp.shortDisplay,
            whatsappAll: whatsapp.all,
            primaryEmail: emails.primaryValue,
            additionalEmails: emails.additional.map((e) => e.value),
            emailsShort: emails.shortDisplay,
            emailsAll: emails.all,
            primaryContactPerson: contacts.primaryValue,
            additionalContacts: contacts.additional.map((e) => (
                e.designation ? `${e.value} (${e.designation})` : e.value
            )),
            contactsShort: contacts.shortDisplay,
            contactsAll: contacts.all,
            primaryAddress: addresses.primaryValue,
            addressesAll: addresses.all,
            websitesAll: websites.all,
            facebookAll: facebook.all,
            instagramAll: instagram.all,
            linkedinAll: linkedin.all,
            productsAll: products.all,
        },
    };
}

function enrichmentIdentityTokens(en) {
    const phones = new Set();
    const emails = new Set();
    const socials = new Set();
    const addresses = new Set();
    for (const p of phoneEntriesFromEnrichment(en)) phones.add(p.key);
    for (const p of whatsappEntriesFromEnrichment(en)) phones.add(p.key);
    for (const e of emailEntriesFromEnrichment(en)) {
        // Skip placeholder / template emails that appear across unrelated sites
        if (/^(your|you|email|user|name|test|sample|example)@/i.test(e.key)) continue;
        const domain = String(e.key).split('@')[1] || '';
        if (['email.com', 'example.com', 'example.org', 'test.com', 'domain.com', 'xyz.com', 'yoursite.com'].includes(domain)) {
            continue;
        }
        emails.add(e.key);
    }
    for (const net of ['facebook', 'instagram', 'linkedin']) {
        for (const s of socialEntriesFromEnrichment(en, net)) socials.add(s.key);
    }
    // Only explicit address.raw counts for identity — city/state alone is too weak
    for (const a of (en?.addresses || [])) {
        const raw = String(a?.raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (raw.length >= 12) addresses.add(raw);
    }
    const isDirectory = Boolean(en?.isDirectorySource)
        || isDirectoryHost(en?.canonicalDomain || en?.websiteUrl || '');
    const websiteSeed = isDirectory
        ? (en?.websiteUrl || en?.canonicalDomain || '')
        : (en?.canonicalDomain || en?.websiteUrl || '');
    return {
        id: String(en?._id || ''),
        domain: buildWebsiteIdentityKey(websiteSeed, { isDirectory })
            || normalizeDomain(en?.canonicalDomain || en?.websiteUrl || ''),
        gstin: String(en?.gstin || '').toUpperCase(),
        name: String(en?.companyName || en?.legalOrDisplayedName || '').trim().toLowerCase(),
        city: String(en?.city || '').trim().toLowerCase(),
        phones,
        emails,
        socials,
        addresses,
        isDirectory,
    };
}

function setsIntersect(a, b) {
    for (const x of a) if (b.has(x)) return true;
    return false;
}

/**
 * Strong identity confirmation only. Name similarity alone never merges.
 * Returns { confirmed: boolean, conflict: boolean, reason: string }
 */
export function confirmSameCompanyIdentity(enrichmentA, enrichmentB) {
    const a = enrichmentIdentityTokens(enrichmentA);
    const b = enrichmentIdentityTokens(enrichmentB);
    if (!a.id || !b.id || a.id === b.id) {
        return { confirmed: a.id && b.id && a.id === b.id, conflict: false, reason: 'same_or_missing_id' };
    }
    if (a.gstin && b.gstin && a.gstin !== b.gstin) {
        return { confirmed: false, conflict: true, reason: 'gstin_conflict' };
    }
    if (a.domain && b.domain && a.domain !== b.domain) {
        // Different domains can still merge on exact phone/email/social/address,
        // but conflicting official domains with no shared contact → review
        const sharedContact = setsIntersect(a.phones, b.phones)
            || setsIntersect(a.emails, b.emails)
            || setsIntersect(a.socials, b.socials)
            || setsIntersect(a.addresses, b.addresses);
        if (!sharedContact) {
            if (a.name && b.name && a.name === b.name && a.city && a.city === b.city) {
                return { confirmed: false, conflict: true, reason: 'name_city_domain_conflict' };
            }
            return { confirmed: false, conflict: false, reason: 'different_domain_no_shared_contact' };
        }
    }
    if (a.domain && b.domain && a.domain === b.domain) {
        return { confirmed: true, conflict: false, reason: 'same_website_domain' };
    }
    if (setsIntersect(a.phones, b.phones)) {
        return { confirmed: true, conflict: false, reason: 'same_exact_phone' };
    }
    if (setsIntersect(a.emails, b.emails)) {
        return { confirmed: true, conflict: false, reason: 'same_exact_email' };
    }
    if (setsIntersect(a.socials, b.socials)) {
        return { confirmed: true, conflict: false, reason: 'same_social_profile' };
    }
    if (setsIntersect(a.addresses, b.addresses) && a.addresses.size && b.addresses.size) {
        return { confirmed: true, conflict: false, reason: 'same_address' };
    }
    if (a.name && b.name && a.name === b.name && a.city && a.city === b.city && (a.domain || b.domain)) {
        // strong name+city alone is insufficient without shared contact/domain equality
        return { confirmed: false, conflict: true, reason: 'possible_duplicate_owner_review' };
    }
    return { confirmed: false, conflict: false, reason: 'no_strong_identity' };
}

/**
 * Build confirmed duplicate groups (union-find). Conflicts are listed separately for owner review.
 */
export function groupConfirmedDuplicateEnrichments(enrichments = []) {
    const list = (enrichments || []).filter((e) => e && e._id);
    const parent = new Map(list.map((e) => [String(e._id), String(e._id)]));
    function find(x) {
        const p = parent.get(x);
        if (p !== x) {
            const r = find(p);
            parent.set(x, r);
            return r;
        }
        return x;
    }
    function union(a, b) {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(rb, ra);
    }

    const conflicts = [];
    for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
            const verdict = confirmSameCompanyIdentity(list[i], list[j]);
            if (verdict.confirmed) union(String(list[i]._id), String(list[j]._id));
            else if (verdict.conflict) {
                conflicts.push({
                    enrichmentIdA: String(list[i]._id),
                    enrichmentIdB: String(list[j]._id),
                    reason: verdict.reason,
                    label: 'Possible Duplicate — Owner Review',
                });
            }
        }
    }

    const groups = new Map();
    for (const en of list) {
        const root = find(String(en._id));
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(en);
    }

    return {
        groups: [...groups.values()],
        conflicts,
    };
}

export function buildContactPresentationForEnrichment(enrichment) {
    return mergeContactsForDuplicateGroup(enrichment ? [enrichment] : []);
}
