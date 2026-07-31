/**
 * Discovery normalization pipeline (Phase 3).
 * Preserves original raw values in fieldProvenance; never deletes source payload.
 */
import {
    normalizeCompanyName,
    normalizeWebsite,
    normalizeEmail,
    normalizePhone,
    normalizeGstin,
    normalizePostalCode,
    normalizeGeoText,
    normalizeEstablishedYear,
    normalizeUrlList,
    normalizeProductCategories,
    normalizeDescription,
    provenanceEntry,
} from './fieldNormalizers.js';
import { computeDataQuality, attachJobDuplicateFlags } from './dataQuality.service.js';

function sourceOf(record) {
    return record?.rawExtractedData?.sourceProvider
        || record?.sourcePlatform
        || 'unknown';
}

function pickRaw(record, keys) {
    for (const k of keys) {
        if (record[k] != null && record[k] !== '') return record[k];
    }
    return '';
}

function uniqBy(list = [], keyFn = (x) => x) {
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

function compactEntry(value, source, normalizedResult, extra = {}) {
    const raw = value == null ? '' : value;
    const normalized = normalizedResult?.normalized || '';
    const key = String(normalized || raw).trim().toLowerCase();
    if (!key) return null;
    return {
        value: String(raw).trim(),
        normalized,
        source: source || 'unknown',
        extractedAt: new Date().toISOString(),
        confidence: extra.confidence != null ? extra.confidence : (normalizedResult?.validationStatus === 'valid' ? 80 : 40),
        validationStatus: normalizedResult?.validationStatus || 'unknown',
        ...extra,
    };
}

function mergeFieldSourceHistory(existing = {}, additions = {}) {
    const out = { ...existing };
    for (const [field, entries] of Object.entries(additions || {})) {
        const merged = [...(out[field] || []), ...(Array.isArray(entries) ? entries : [entries]).filter(Boolean)];
        out[field] = uniqBy(merged, (entry) => [
            entry?.source || '',
            entry?.normalized || '',
            entry?.raw || '',
            entry?.value || '',
        ].join('|'));
    }
    return out;
}

/**
 * Normalize one discovery/extractor record.
 * Top-level fields stay CRM-compatible; originals live under fieldProvenance + rawExtractedData.originalSnapshot.
 */
export function normalizeDiscoveryRecord(record = {}, options = {}) {
    const src = options.source || sourceOf(record);
    const extractedAt = record.extractedAt || new Date();

    const nameRaw = pickRaw(record, ['companyName', 'name', 'legalName']);
    const name = normalizeCompanyName(nameRaw);
    const websiteRaw = pickRaw(record, ['website', 'sourceUrl']);
    const website = normalizeWebsite(websiteRaw);
    const emailRaw = pickRaw(record, ['email']);
    const email = normalizeEmail(emailRaw);
    const phoneRaw = pickRaw(record, ['phone']);
    const phone = normalizePhone(phoneRaw);
    const mobileRaw = pickRaw(record, ['mobile']);
    const mobile = normalizePhone(mobileRaw);
    const gstinRaw = pickRaw(record, ['gstin', 'gstNo', 'gstNumber']);
    const gstin = normalizeGstin(gstinRaw);
    const cityRaw = pickRaw(record, ['city']);
    const city = normalizeGeoText(cityRaw);
    const stateRaw = pickRaw(record, ['stateProvince', 'state']);
    const state = normalizeGeoText(stateRaw);
    const countryRaw = pickRaw(record, ['country']) || 'India';
    const country = normalizeGeoText(countryRaw);
    const pinRaw = pickRaw(record, ['pincode', 'postalCode', 'zip']);
    const pin = normalizePostalCode(pinRaw, country.normalized || countryRaw);
    const addrRaw = pickRaw(record, ['address']);
    const address = normalizeDescription(addrRaw);
    const descRaw = pickRaw(record, ['businessDescription', 'description', 'natureOfBusiness']);
    const description = normalizeDescription(descRaw);
    const yearRaw = record.establishedYear ?? record.rawExtractedData?.establishedYear;
    const year = normalizeEstablishedYear(yearRaw);
    const products = normalizeProductCategories(record.productCategories || record.keywords);
    const socialFb = normalizeWebsite(record.socialLinks?.facebook || record.rawExtractedData?.facebookPageUrl || '');
    const socialIg = normalizeWebsite(record.socialLinks?.instagram || record.rawExtractedData?.instagramProfileUrl || '');
    const socialLi = normalizeWebsite(record.socialLinks?.linkedin || '');
    const sourceUrls = normalizeUrlList([
        record.sourceUrl,
        ...((record.rawExtractedData?.sourceUrls) || []),
    ]);
    const directoryUrls = normalizeUrlList(record.rawExtractedData?.directoryUrls || []);

    const fieldProvenance = {
        companyName: provenanceEntry(nameRaw, name, src),
        legalName: provenanceEntry(nameRaw, { normalized: name.legalName, validationStatus: name.validationStatus }, src),
        website: provenanceEntry(websiteRaw, website, src, { domain: website.domain }),
        domain: provenanceEntry(website.domain || websiteRaw, { normalized: website.domain, validationStatus: website.domain ? 'valid' : website.validationStatus }, src),
        email: provenanceEntry(emailRaw, email, src, { isGeneric: email.isGeneric }),
        phone: provenanceEntry(phoneRaw, phone, src, { digits: phone.digits, e164Hint: phone.e164Hint }),
        mobile: provenanceEntry(mobileRaw, mobile, src, { digits: mobile.digits, e164Hint: mobile.e164Hint }),
        gstin: provenanceEntry(gstinRaw, gstin, src),
        address: provenanceEntry(addrRaw, address, src),
        city: provenanceEntry(cityRaw, city, src),
        state: provenanceEntry(stateRaw, state, src),
        country: provenanceEntry(countryRaw, country, src),
        postalCode: provenanceEntry(pinRaw, pin, src),
        description: provenanceEntry(descRaw, description, src),
        establishedYear: provenanceEntry(yearRaw, year, src),
        productCategories: provenanceEntry(record.productCategories || record.keywords || [], products, src),
        socialFacebook: provenanceEntry(record.socialLinks?.facebook || '', socialFb, src),
        socialInstagram: provenanceEntry(record.socialLinks?.instagram || '', socialIg, src),
        socialLinkedin: provenanceEntry(record.socialLinks?.linkedin || '', socialLi, src),
        sourceUrls: provenanceEntry(record.sourceUrl || '', sourceUrls, src),
        directoryUrls: provenanceEntry(record.rawExtractedData?.directoryUrls || [], directoryUrls, src),
    };

    const discoveredWebsites = uniqBy([
        compactEntry(websiteRaw, src, website, { domain: website.domain }),
        ...((record.rawExtractedData?.discoveredWebsites) || []),
    ].filter(Boolean), (entry) => entry.normalized || entry.value);

    const discoveredDomains = uniqBy([
        compactEntry(website.domain || websiteRaw, src, { normalized: website.domain, validationStatus: website.domain ? 'valid' : website.validationStatus }),
        ...((record.rawExtractedData?.discoveredDomains) || []),
    ].filter(Boolean), (entry) => entry.normalized || entry.value);

    const publicPhones = uniqBy([
        compactEntry(phoneRaw, src, phone, { digits: phone.digits, kind: 'phone' }),
        compactEntry(mobileRaw, src, mobile, { digits: mobile.digits, kind: 'mobile' }),
        ...((record.rawExtractedData?.publicPhones) || []),
    ].filter(Boolean), (entry) => entry.normalized || entry.value || entry.digits);

    const publicEmails = uniqBy([
        compactEntry(emailRaw, src, email, { isGeneric: email.isGeneric }),
        ...((record.rawExtractedData?.publicEmails) || []),
    ].filter(Boolean), (entry) => entry.normalized || entry.value);

    const fieldSourceHistory = mergeFieldSourceHistory(record.rawExtractedData?.fieldSourceHistory, {
        companyName: fieldProvenance.companyName,
        legalName: fieldProvenance.legalName,
        website: fieldProvenance.website,
        domain: fieldProvenance.domain,
        email: fieldProvenance.email,
        phone: fieldProvenance.phone,
        mobile: fieldProvenance.mobile,
        gstin: fieldProvenance.gstin,
        address: fieldProvenance.address,
        city: fieldProvenance.city,
        state: fieldProvenance.state,
        country: fieldProvenance.country,
        postalCode: fieldProvenance.postalCode,
        description: fieldProvenance.description,
        establishedYear: fieldProvenance.establishedYear,
        productCategories: fieldProvenance.productCategories,
        socialFacebook: fieldProvenance.socialFacebook,
        socialInstagram: fieldProvenance.socialInstagram,
        socialLinkedin: fieldProvenance.socialLinkedin,
    });

    // Preserve an immutable original snapshot once
    const previousOriginal = record.rawExtractedData?.originalSnapshot;
    const originalSnapshot = previousOriginal || {
        companyName: record.companyName,
        website: record.website,
        email: record.email,
        phone: record.phone,
        mobile: record.mobile,
        address: record.address,
        city: record.city,
        stateProvince: record.stateProvince || record.state,
        country: record.country,
        pincode: record.pincode,
        gstin: record.gstin,
        businessDescription: record.businessDescription,
        sourceUrl: record.sourceUrl,
        socialLinks: record.socialLinks,
        capturedAt: new Date().toISOString(),
    };

    const normalized = {
        ...record,
        companyName: name.normalized || record.companyName || '',
        legalName: name.legalName || record.legalName || '',
        website: website.normalized || record.website || '',
        normalizedDomain: website.domain || record.normalizedDomain || '',
        email: email.normalized || '',
        phone: phone.normalized || '',
        mobile: mobile.normalized || '',
        gstin: gstin.normalized || record.gstin || '',
        address: address.normalized || record.address || '',
        city: city.normalized || record.city || '',
        stateProvince: state.normalized || record.stateProvince || record.state || '',
        country: country.normalized || record.country || '',
        pincode: pin.normalized || record.pincode || '',
        businessDescription: description.normalized || record.businessDescription || '',
        establishedYear: year.normalized != null ? year.normalized : record.establishedYear,
        productCategories: products.normalized.length ? products.normalized : (record.productCategories || []),
        socialLinks: {
            ...(record.socialLinks || {}),
            facebook: socialFb.normalized || record.socialLinks?.facebook || '',
            instagram: socialIg.normalized || record.socialLinks?.instagram || '',
            linkedin: socialLi.normalized || record.socialLinks?.linkedin || '',
        },
        sourceUrl: record.sourceUrl || website.normalized || '',
        extractedAt: extractedAt instanceof Date ? extractedAt : new Date(extractedAt),
        fieldProvenance,
        rawExtractedData: {
            ...(record.rawExtractedData || {}),
            originalSnapshot,
            normalizationVersion: 'phase3-v1',
            sourceUrls: sourceUrls.normalized.length
                ? sourceUrls.normalized
                : (record.rawExtractedData?.sourceUrls || []),
            directoryUrls: directoryUrls.normalized,
            discoveredWebsites,
            discoveredDomains,
            publicPhones,
            publicEmails,
            fieldSourceHistory,
        },
    };

    const dataQuality = computeDataQuality(normalized);
    normalized.dataQuality = dataQuality;
    normalized.dataQualityScore = dataQuality.score;
    normalized.dataQualityFlags = dataQuality.flags;

    return normalized;
}

export function normalizeDiscoveryRecordList(records = [], options = {}) {
    const normalized = (records || []).map((r) => normalizeDiscoveryRecord(r, options));
    const withDup = attachJobDuplicateFlags(normalized);
    return withDup.map((r) => {
        const dq = computeDataQuality(r);
        return {
            ...r,
            dataQuality: dq,
            dataQualityScore: dq.score,
            dataQualityFlags: dq.flags,
        };
    });
}

export { computeDataQuality, attachJobDuplicateFlags };
