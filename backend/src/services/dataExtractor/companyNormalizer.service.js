import { normalizeExtractorUrl } from './extractor.utils.js';

const LEGAL_SUFFIXES = /\b(pvt\.?\s*ltd\.?|private\s+limited|llp|l\.?l\.?c\.?|inc\.?|corp\.?|co\.?|ltd\.?|limited|gmbh|plc)\b/gi;

export function normalizeCompanyName(name) {
    let s = String(name || '').trim();
    if (!s) return '';
    s = s.replace(/\s+/g, ' ');
    s = s.replace(/\|.*$/, '').replace(/-.*$/, '').trim();
    return s.slice(0, 120);
}

export function standardizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 8) return String(phone || '').trim();
    if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    if (digits.length === 12 && digits.startsWith('91')) {
        return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
    }
    return `+${digits}`;
}

export function standardizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

export function guessBusinessType(record) {
    const text = [
        record.companyName,
        record.businessDescription,
        record.natureOfBusiness,
        ...(record.keywords || []),
        ...(record.productCategories || []),
    ].join(' ').toLowerCase();

    if (/\b(manufacturer|manufacturing|factory|oem|production)\b/.test(text)) return 'manufacturer';
    if (/\b(trader|trading|distributor|dealer|wholesaler)\b/.test(text)) return 'trader';
    if (/\b(exporter|export)\b/.test(text)) return 'exporter';
    if (/\b(importer|import)\b/.test(text)) return 'importer';
    return 'business';
}

export function normalizeExtractedRecord(record) {
    const { url, domain } = normalizeExtractorUrl(record.website || record.sourceUrl);
    const companyName = normalizeCompanyName(record.companyName);
    const cleanedName = companyName.replace(LEGAL_SUFFIXES, '').trim() || companyName;

    return {
        ...record,
        companyName: cleanedName || companyName,
        website: url || record.website,
        normalizedDomain: domain || record.normalizedDomain || '',
        email: standardizeEmail(record.email),
        phone: standardizePhone(record.phone),
        mobile: standardizePhone(record.mobile),
        natureOfBusiness: record.natureOfBusiness || guessBusinessType(record),
        productCategories: record.productCategories?.length
            ? record.productCategories
            : (record.keywords || []).slice(0, 5),
    };
}

export function mergeDuplicatePreviewRecords(records) {
    const byDomain = new Map();
    const merged = [];

    for (const raw of records) {
        const rec = normalizeExtractedRecord(raw);
        const key = rec.normalizedDomain || rec.email || rec.companyName?.toLowerCase();
        if (!key) {
            merged.push(rec);
            continue;
        }
        if (byDomain.has(key)) {
            const existing = byDomain.get(key);
            existing.email = existing.email || rec.email;
            existing.phone = existing.phone || rec.phone;
            existing.mobile = existing.mobile || rec.mobile;
            existing.businessDescription = existing.businessDescription || rec.businessDescription;
            existing.confidenceScore = Math.max(existing.confidenceScore || 0, rec.confidenceScore || 0);
            existing.leadScore = Math.max(existing.leadScore || 0, rec.leadScore || 0);
            existing._isDuplicate = true;
            continue;
        }
        byDomain.set(key, rec);
        merged.push(rec);
    }

    return merged;
}
