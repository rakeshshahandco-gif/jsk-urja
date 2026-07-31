/**
 * Rule-based explainable data quality score (0–100) + flags.
 */

export const QUALITY_FLAGS = {
    MISSING_COMPANY_NAME: 'missing_company_name',
    INVALID_URL: 'invalid_url',
    INVALID_EMAIL: 'invalid_email',
    INVALID_PHONE: 'invalid_phone',
    INVALID_GSTIN: 'invalid_gstin',
    GENERIC_EMAIL: 'generic_email',
    DUPLICATE_DOMAIN: 'duplicate_domain',
    DUPLICATE_PHONE: 'duplicate_phone',
    DUPLICATE_EMAIL: 'duplicate_email',
    POSSIBLE_DUPLICATE_COMPANY: 'possible_duplicate_company',
    CONFLICTING_CITY: 'conflicting_city',
    CONFLICTING_BUSINESS_CATEGORY: 'conflicting_business_category',
    LOW_CONFIDENCE_EXTRACTION: 'low_confidence_extraction',
    SOURCE_UNAVAILABLE: 'source_unavailable',
    STALE_DATA: 'stale_data',
};

/**
 * Compute quality score with explainable components.
 */
export function computeDataQuality(record = {}, { now = new Date() } = {}) {
    const flags = [];
    const components = [];

    const name = String(record.companyName || '').trim();
    const website = String(record.website || '').trim();
    const domain = String(record.normalizedDomain || '').trim();
    const phone = String(record.phone || record.mobile || '').trim();
    const email = String(record.email || '').trim();
    const address = String(record.address || '').trim();
    const products = record.productCategories || record.keywords || [];
    const sources = record.rawExtractedData?.sourceProviders || [];
    const conf = Number(record.confidenceScore || 0);
    const prov = record.fieldProvenance || {};

    // --- components (max 100) ---
    let score = 0;

    if (name) {
        score += 20;
        components.push({ id: 'company_name', points: 20, max: 20, reason: 'Company name present' });
    } else {
        flags.push(QUALITY_FLAGS.MISSING_COMPANY_NAME);
        components.push({ id: 'company_name', points: 0, max: 20, reason: 'Company name missing' });
    }

    if (website || domain) {
        score += 15;
        components.push({ id: 'website', points: 15, max: 15, reason: 'Website/domain available' });
    } else {
        components.push({ id: 'website', points: 0, max: 15, reason: 'Website missing' });
    }
    if (prov.website?.validationStatus === 'invalid' || (website && !domain && prov.website?.validationStatus === 'invalid')) {
        flags.push(QUALITY_FLAGS.INVALID_URL);
    }

    if (phone) {
        score += 12;
        components.push({ id: 'phone', points: 12, max: 12, reason: 'Public phone present' });
    } else {
        components.push({ id: 'phone', points: 0, max: 12, reason: 'Phone missing' });
    }
    if (prov.phone?.validationStatus === 'invalid' || prov.mobile?.validationStatus === 'invalid') {
        flags.push(QUALITY_FLAGS.INVALID_PHONE);
    }

    if (email) {
        score += 12;
        components.push({ id: 'email', points: 12, max: 12, reason: 'Public email present' });
        if (prov.email?.isGeneric) {
            flags.push(QUALITY_FLAGS.GENERIC_EMAIL);
            score -= 3;
            components.push({ id: 'email_generic_penalty', points: -3, max: 0, reason: 'Generic email domain penalty' });
        }
    } else {
        components.push({ id: 'email', points: 0, max: 12, reason: 'Email missing' });
    }
    if (prov.email?.validationStatus === 'invalid') flags.push(QUALITY_FLAGS.INVALID_EMAIL);

    if (address || (record.city && record.stateProvince)) {
        score += 10;
        components.push({ id: 'address', points: 10, max: 10, reason: 'Address / city-state available' });
    } else {
        components.push({ id: 'address', points: 0, max: 10, reason: 'Address missing' });
    }

    if (Array.isArray(products) && products.length) {
        score += 8;
        components.push({ id: 'products', points: 8, max: 8, reason: 'Product/category information available' });
    } else {
        components.push({ id: 'products', points: 0, max: 8, reason: 'No product categories' });
    }

    const sourceCount = Array.isArray(sources) ? new Set(sources.filter(Boolean)).size : 0;
    if (sourceCount >= 2) {
        score += 10;
        components.push({ id: 'multi_source', points: 10, max: 10, reason: 'Multiple sources agree (' + sourceCount + ')' });
    } else if (sourceCount === 1) {
        score += 4;
        components.push({ id: 'multi_source', points: 4, max: 10, reason: 'Single source only' });
    } else {
        components.push({ id: 'multi_source', points: 0, max: 10, reason: 'Source not recorded' });
    }

    // Conflict / consistency
    let conflictPenalty = 0;
    if (record._qualityConflicts?.city) {
        flags.push(QUALITY_FLAGS.CONFLICTING_CITY);
        conflictPenalty += 5;
    }
    if (record._qualityConflicts?.businessCategory) {
        flags.push(QUALITY_FLAGS.CONFLICTING_BUSINESS_CATEGORY);
        conflictPenalty += 4;
    }
    if (conflictPenalty) {
        score -= conflictPenalty;
        components.push({ id: 'conflicts', points: -conflictPenalty, max: 0, reason: 'Conflicting fields across sources' });
    } else {
        score += 5;
        components.push({ id: 'conflicts', points: 5, max: 5, reason: 'No conflicting fields detected' });
    }

    // Freshness / confidence
    const extractedAt = record.extractedAt || record.rawExtractedData?.extractedAt || record.fieldProvenance?.companyName?.extractedAt;
    let freshPoints = 5;
    if (extractedAt) {
        const ageMs = now.getTime() - new Date(extractedAt).getTime();
        const ageDays = ageMs / (24 * 60 * 60 * 1000);
        if (ageDays > 180) {
            freshPoints = 0;
            flags.push(QUALITY_FLAGS.STALE_DATA);
        } else if (ageDays > 60) {
            freshPoints = 2;
        }
    }
    score += freshPoints;
    components.push({ id: 'freshness', points: freshPoints, max: 5, reason: freshPoints ? 'Recently checked / available timestamp' : 'Stale or missing extraction timestamp' });

    if (conf > 0 && conf < 35) {
        flags.push(QUALITY_FLAGS.LOW_CONFIDENCE_EXTRACTION);
        score -= 5;
        components.push({ id: 'low_confidence_penalty', points: -5, max: 0, reason: 'Low extraction confidence (' + conf + ')' });
    }

    if (prov.gstin?.validationStatus === 'invalid') flags.push(QUALITY_FLAGS.INVALID_GSTIN);
    if (record.duplicateStatus && record.duplicateStatus !== 'none') {
        flags.push(QUALITY_FLAGS.POSSIBLE_DUPLICATE_COMPANY);
    }
    if (record.rawExtractedData?.skipReason || record.rawExtractedData?.sourceUnavailable) {
        flags.push(QUALITY_FLAGS.SOURCE_UNAVAILABLE);
    }

    // Duplicate markers from merge context
    if (record._dupFlags?.domain) flags.push(QUALITY_FLAGS.DUPLICATE_DOMAIN);
    if (record._dupFlags?.phone) flags.push(QUALITY_FLAGS.DUPLICATE_PHONE);
    if (record._dupFlags?.email) flags.push(QUALITY_FLAGS.DUPLICATE_EMAIL);

    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
        score,
        flags: [...new Set(flags)],
        components,
        checkedAt: now.toISOString(),
        explainable: true,
        method: 'RULE_BASED',
    };
}

export function attachJobDuplicateFlags(records = []) {
    const domainCount = new Map();
    const phoneCount = new Map();
    const emailCount = new Map();
    for (const r of records) {
        const d = String(r.normalizedDomain || '').toLowerCase();
        const p = String(r.phone || r.mobile || '').replace(/\D/g, '').slice(-10);
        const e = String(r.email || '').toLowerCase();
        if (d) domainCount.set(d, (domainCount.get(d) || 0) + 1);
        if (p.length >= 8) phoneCount.set(p, (phoneCount.get(p) || 0) + 1);
        if (e) emailCount.set(e, (emailCount.get(e) || 0) + 1);
    }
    return records.map((r) => {
        const d = String(r.normalizedDomain || '').toLowerCase();
        const p = String(r.phone || r.mobile || '').replace(/\D/g, '').slice(-10);
        const e = String(r.email || '').toLowerCase();
        return {
            ...r,
            _dupFlags: {
                domain: !!(d && domainCount.get(d) > 1),
                phone: !!(p.length >= 8 && phoneCount.get(p) > 1),
                email: !!(e && emailCount.get(e) > 1),
            },
        };
    });
}
