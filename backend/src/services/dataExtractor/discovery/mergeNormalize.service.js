import { normalizeDiscoveryRecord, computeDataQuality, attachJobDuplicateFlags } from './normalization/normalizeRecord.service.js';

export function normalizeDomain(website) {
    try {
        const raw = String(website || '');
        const withProto = /^https?:\/\//i.test(raw) ? raw : (`https://${raw}`);
        const u = new URL(withProto);
        return u.hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        return '';
    }
}

export function normalizePhoneDigits(phone) {
    return String(phone || '').replace(/\D/g, '');
}

export function normalizeCompanyKey(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
}

export function preferNonEmpty(existing, incoming) {
    if (incoming == null || incoming === '') return existing;
    if (existing == null || existing === '') return incoming;
    return existing;
}

function normText(v) {
    return String(v || '').trim().toLowerCase();
}

function uniqEntries(list = [], keyFn = (x) => x) {
    const out = [];
    const seen = new Set();
    for (const item of list) {
        const key = keyFn(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}

function mergeFieldSourceHistory(existing = {}, incoming = {}) {
    const out = { ...(existing || {}) };
    for (const [field, entries] of Object.entries(incoming || {})) {
        const merged = [...(out[field] || []), ...(entries || [])];
        out[field] = uniqEntries(merged, (entry) => [
            entry?.source || '',
            entry?.normalized || '',
            entry?.raw || '',
            entry?.value || '',
        ].join('|'));
    }
    return out;
}

export function strongMatchKey(record) {
    const domain = record.normalizedDomain || normalizeDomain(record.website);
    if (domain) return 'domain:' + domain;
    const phone = normalizePhoneDigits(record.phone || record.mobile);
    if (phone.length >= 8) return 'phone:' + phone.slice(-10);
    const email = String(record.email || '').trim().toLowerCase();
    if (email) return 'email:' + email;
    const placeId = record.rawExtractedData?.placeId || record.rawExtractedData?.googlePlaceId;
    if (placeId) return 'place:' + placeId;
    const fb = record.socialLinks?.facebook || record.rawExtractedData?.facebookPageUrl;
    if (fb) return 'fb:' + fb;
    const ig = record.socialLinks?.instagram || record.rawExtractedData?.instagramProfileUrl;
    if (ig) return 'ig:' + ig;
    return '';
}

export function mergeDiscoveryRecords(existing, incoming) {
    if (!existing) return incoming;
    if (!incoming) return existing;
    const sourceProviders = [...new Set([
        ...((existing.rawExtractedData || {}).sourceProviders || []),
        ...((incoming.rawExtractedData || {}).sourceProviders || []),
        existing.rawExtractedData?.sourceProvider,
        incoming.rawExtractedData?.sourceProvider,
    ].filter(Boolean))];
    const sourceUrls = [...new Set([
        existing.sourceUrl,
        incoming.sourceUrl,
        ...((existing.rawExtractedData || {}).sourceUrls || []),
        ...((incoming.rawExtractedData || {}).sourceUrls || []),
    ].filter(Boolean))];
    const discoveredWebsites = uniqEntries([
        ...((existing.rawExtractedData || {}).discoveredWebsites || []),
        ...((incoming.rawExtractedData || {}).discoveredWebsites || []),
    ], (entry) => entry?.normalized || entry?.value);
    const discoveredDomains = uniqEntries([
        ...((existing.rawExtractedData || {}).discoveredDomains || []),
        ...((incoming.rawExtractedData || {}).discoveredDomains || []),
    ], (entry) => entry?.normalized || entry?.value);
    const publicPhones = uniqEntries([
        ...((existing.rawExtractedData || {}).publicPhones || []),
        ...((incoming.rawExtractedData || {}).publicPhones || []),
    ], (entry) => entry?.normalized || entry?.value || entry?.digits);
    const publicEmails = uniqEntries([
        ...((existing.rawExtractedData || {}).publicEmails || []),
        ...((incoming.rawExtractedData || {}).publicEmails || []),
    ], (entry) => entry?.normalized || entry?.value);
    const fieldSourceHistory = mergeFieldSourceHistory(
        (existing.rawExtractedData || {}).fieldSourceHistory,
        (incoming.rawExtractedData || {}).fieldSourceHistory,
    );

    const conflicts = { ...(existing._qualityConflicts || {}) };
    const ec = normText(existing.city);
    const ic = normText(incoming.city);
    if (ec && ic && ec !== ic) conflicts.city = { a: existing.city, b: incoming.city };
    const ecat = normText((existing.productCategories || [])[0] || existing.natureOfBusiness);
    const icat = normText((incoming.productCategories || [])[0] || incoming.natureOfBusiness);
    if (ecat && icat && ecat !== icat) {
        conflicts.businessCategory = { a: ecat, b: icat };
    }

    // Preserve both originals under merge history (do not overwrite first snapshot)
    const originalSnapshot = existing.rawExtractedData?.originalSnapshot
        || incoming.rawExtractedData?.originalSnapshot
        || null;

    const merged = {
        ...existing,
        companyName: preferNonEmpty(existing.companyName, incoming.companyName),
        website: preferNonEmpty(existing.website, incoming.website),
        normalizedDomain: preferNonEmpty(existing.normalizedDomain, incoming.normalizedDomain || normalizeDomain(incoming.website)),
        email: preferNonEmpty(existing.email, incoming.email),
        phone: preferNonEmpty(existing.phone, incoming.phone),
        mobile: preferNonEmpty(existing.mobile, incoming.mobile),
        address: preferNonEmpty(existing.address, incoming.address),
        city: preferNonEmpty(existing.city, incoming.city),
        stateProvince: preferNonEmpty(existing.stateProvince, incoming.stateProvince),
        country: preferNonEmpty(existing.country, incoming.country),
        pincode: preferNonEmpty(existing.pincode, incoming.pincode),
        gstin: preferNonEmpty(existing.gstin, incoming.gstin),
        businessDescription: preferNonEmpty(existing.businessDescription, incoming.businessDescription),
        socialLinks: {
            ...(existing.socialLinks || {}),
            facebook: preferNonEmpty(existing.socialLinks?.facebook, incoming.socialLinks?.facebook),
            instagram: preferNonEmpty(existing.socialLinks?.instagram, incoming.socialLinks?.instagram),
            linkedin: preferNonEmpty(existing.socialLinks?.linkedin, incoming.socialLinks?.linkedin),
            youtube: preferNonEmpty(existing.socialLinks?.youtube, incoming.socialLinks?.youtube),
            twitter: preferNonEmpty(existing.socialLinks?.twitter, incoming.socialLinks?.twitter),
        },
        confidenceScore: Math.max(existing.confidenceScore || 0, incoming.confidenceScore || 0),
        _qualityConflicts: conflicts,
        fieldProvenance: {
            ...(incoming.fieldProvenance || {}),
            ...(existing.fieldProvenance || {}),
        },
        rawExtractedData: {
            ...(existing.rawExtractedData || {}),
            ...(incoming.rawExtractedData || {}),
            sourceProviders,
            sourceUrls,
            originalSnapshot,
            discoveredWebsites,
            discoveredDomains,
            publicPhones,
            publicEmails,
            fieldSourceHistory,
            mergeExplanation: 'Merged on strong identifier; empty fields filled without overwriting valid values. Originals preserved in originalSnapshot.',
            mergeHistory: [
                ...((existing.rawExtractedData || {}).mergeHistory || []),
                {
                    at: new Date().toISOString(),
                    fromSource: incoming.rawExtractedData?.sourceProvider || incoming.sourcePlatform,
                    conflicts,
                },
            ].slice(-20),
        },
    };

    const dq = computeDataQuality(merged);
    merged.dataQuality = dq;
    merged.dataQualityScore = dq.score;
    merged.dataQualityFlags = dq.flags;
    return merged;
}

export function mergePreviewList(records = []) {
    const byKey = new Map();
    const out = [];
    for (const raw of records) {
        const rec = normalizeDiscoveryRecord(raw);
        const key = strongMatchKey(rec) || ('row:' + out.length + ':' + normalizeCompanyKey(rec.companyName));
        if (byKey.has(key) && !String(key).startsWith('row:')) {
            const idx = byKey.get(key);
            out[idx] = mergeDiscoveryRecords(out[idx], rec);
            out[idx]._mergedDraft = true;
            continue;
        }
        byKey.set(key, out.length);
        out.push(rec);
    }
    return attachJobDuplicateFlags(out).map((r) => {
        const dq = computeDataQuality(r);
        return { ...r, dataQuality: dq, dataQualityScore: dq.score, dataQualityFlags: dq.flags };
    });
}
