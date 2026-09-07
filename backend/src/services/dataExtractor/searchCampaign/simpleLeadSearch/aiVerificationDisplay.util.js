/**
 * Display-only AI verification labels, evidence checklist, and business-potential
 * scoring from existing enrichment / qualification / genuineness fields.
 * Does not invent missing company data. Not a legal certification.
 */

export const AI_VERIFICATION_TOOLTIP =
    'AI verification is based on matching public-source evidence and does not constitute legal certification.';

export const AI_STATUS = Object.freeze({
    VERIFIED: 'VERIFIED',
    HIGH_CONFIDENCE: 'HIGH CONFIDENCE',
    NEEDS_REVIEW: 'NEEDS REVIEW',
    LOW_CONFIDENCE: 'LOW CONFIDENCE',
    REJECTED: 'REJECTED / NOT RELEVANT',
    PENDING: '',
});

export const CRM_STATUS = Object.freeze({
    NOT_IN_CRM: 'NOT IN CRM',
    LEAD_CREATED: 'LEAD CREATED',
    EXISTING_LEAD: 'EXISTING LEAD',
    EXISTING_CUSTOMER: 'EXISTING CUSTOMER',
});

const LED_HINT = /led|light|luminair|lighting|driver|dali|automation|oem|manufacturer/i;
const JSK_PRODUCTS = ['Phase Cut Driver', 'DALI Driver', 'Smart Driver', 'Home Automation'];

export function safeHttpUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (/^(javascript|data|vbscript):/i.test(s)) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (/^www\./i.test(s) || /^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(s)) return `https://${s}`;
    return '';
}

export function buildWhatsAppUrl(phone, { labelled = false, country = '' } = {}) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) return '';
    if (!labelled && digits.length < 10) return '';
    let n = digits;
    if (n.length === 10 && /india|in/i.test(String(country || ''))) n = `91${n}`;
    return `https://wa.me/${n}`;
}

function hasText(v) {
    return Boolean(String(v || '').trim());
}

function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

export function mapAiStatus({ genuinenessStatus, flags, genuinenessScore, productMatchStrength } = {}) {
    const st = String(genuinenessStatus || '').toLowerCase();
    const industry = String(productMatchStrength || '').toLowerCase();
    if (flags?.isDirectoryListing || st.includes('directory') || st.includes('unusable')) {
        return AI_STATUS.REJECTED;
    }
    if (st.includes('rejected') && !flags?.isVerifiedRelevant) {
        return AI_STATUS.REJECTED;
    }
    if (flags?.isVerifiedRelevant) return AI_STATUS.VERIFIED;
    if (/unrelated|job\/course/.test(industry)) return AI_STATUS.REJECTED;
    if (flags?.hasVerified || st === 'verified_genuine' || st === 'verified') {
        if (/strong product match/.test(industry)) return AI_STATUS.HIGH_CONFIDENCE;
        return AI_STATUS.NEEDS_REVIEW;
    }
    if (st === 'likely_genuine' || st.includes('likely')) {
        if (/strong product match/.test(industry)) return AI_STATUS.HIGH_CONFIDENCE;
        if (/possible|weak/.test(industry)) return AI_STATUS.NEEDS_REVIEW;
        return AI_STATUS.HIGH_CONFIDENCE;
    }
    if (st.includes('human_review') || st.includes('review') || flags?.isReview) {
        return AI_STATUS.NEEDS_REVIEW;
    }
    if (st.includes('unreliable') || (hasText(st) && num(genuinenessScore) > 0 && num(genuinenessScore) < 40)) {
        return AI_STATUS.LOW_CONFIDENCE;
    }
    if (!hasText(st)) return AI_STATUS.PENDING;
    if (num(genuinenessScore) >= 80 && /strong product match/.test(industry)) return AI_STATUS.HIGH_CONFIDENCE;
    if (num(genuinenessScore) >= 60) return AI_STATUS.HIGH_CONFIDENCE;
    return AI_STATUS.LOW_CONFIDENCE;
}

export function industryMatchPercent(row = {}) {
    const rel = num(row.relevanceScore, NaN);
    if (Number.isFinite(rel) && rel >= 0) return Math.max(0, Math.min(100, Math.round(rel)));
    const match = String(row.businessTypeMatch || row.productMatchStrength || '').toLowerCase();
    if (match.includes('unrelated') || match.includes('mismatch')) return 18;
    if (match.includes('strong') || match === 'match') return 88;
    if (match.includes('possible') || match.includes('partial')) return 64;
    if (row.flags?.isVerifiedRelevant) return 90;
    if (row.flags?.hasQualified) return 58;
    return 0;
}

export function contactCompletenessPercent(row = {}) {
    const parts = [
        hasText(row.phone || row.mobile || row.telephone),
        hasText(row.email),
        hasText(row.website),
        hasText(row.primaryAddress || row.city),
        hasText(row.facebook || row.instagram || row.linkedin || row.youtube),
    ];
    return Math.round((parts.filter(Boolean).length / parts.length) * 100);
}

export function businessPotentialFromRow(row = {}) {
    let score = 0;
    const directory = Boolean(row.flags?.isDirectoryListing || /directory/i.test(String(row.genuinenessStatus || '')));
    if (hasText(row.website) && !directory) score += 18;
    if (hasText(row.phone || row.mobile)) score += 14;
    if (hasText(row.email)) score += 12;
    if (hasText(row.facebook || row.instagram || row.linkedin)) score += 10;
    if (hasText(row.primaryAddress || row.city)) score += 8;
    if (hasText(row.productsServices)) score += 8;
    const mfg = String(row.manufacturerEvidence || row.businessType || '').toLowerCase();
    if (/manufacturer|oem|odm|factory/.test(mfg)) score += 14;
    else if (/dealer|distributor|integrator/.test(mfg)) score += 7;
    const gen = num(row.genuinenessScore);
    if (gen >= 80 || row.flags?.hasVerified) score += 16;
    else if (gen >= 55 || String(row.genuinenessStatus || '').includes('likely')) score += 8;
    score = Math.max(0, Math.min(100, score));
    const label = score >= 75 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW';
    return { score, label };
}

export function suggestedProductsFromEvidence(row = {}) {
    const hay = [
        row.productsServices, row.companyName, row.searchKeyword, row.queryUsed,
        row.businessType, row.snippet, row.title,
    ].join(' ');
    if (!LED_HINT.test(hay)) return [];
    const mfg = /manufacturer|oem|odm|factory|integrator|project/i.test(
        `${row.businessType || ''} ${row.manufacturerEvidence || ''} ${row.productsServices || ''}`,
    );
    if (!mfg && !row.flags?.isVerifiedRelevant) return [];
    return [...JSK_PRODUCTS];
}

export function buildVerificationEvidence(row = {}) {
    const domain = String(row.displayDomain || '').toLowerCase().replace(/^www\./, '');
    const phoneSrc = String(row.phoneSourceUrl || '').toLowerCase();
    const officialWebsite = hasText(row.website) && !row.flags?.isDirectoryListing;
    const phoneMatchesWebsite = Boolean(officialWebsite && domain && phoneSrc.includes(domain));
    const ig = String(row.instagramMatch || '').toLowerCase();
    const instagramNameMatch = ig === 'verified' || ig === 'possible_match';
    const productMatch = /strong|possible|match/i.test(String(row.productMatchStrength || row.businessTypeMatch || ''));
    const addressConfirmed = String(row.locationMatch || '').toLowerCase() === 'match'
        || Boolean(row.officeInSelectedCity);
    const conflicting = Array.isArray(row.conflictingEvidence) && row.conflictingEvidence.length > 0;

    return [
        { key: 'official_website', label: 'Official website found', value: officialWebsite },
        { key: 'phone_website', label: 'Phone matches official website', value: phoneMatchesWebsite },
        { key: 'instagram_name', label: 'Instagram company name match', value: instagramNameMatch },
        { key: 'product_category', label: 'Product category match', value: productMatch },
        { key: 'address_confirmed', label: 'Address cross-confirmed', value: addressConfirmed },
        { key: 'conflicting', label: 'Conflicting data', value: conflicting },
    ];
}

export function buildAiVerificationDisplay(row = {}) {
    const aiStatus = mapAiStatus(row);
    const confidence = Math.max(0, Math.min(100, Math.round(num(row.genuinenessScore, 0))));
    const industryMatch = industryMatchPercent(row);
    const contactCompleteness = contactCompletenessPercent(row);
    const potential = businessPotentialFromRow(row);
    const evidence = buildVerificationEvidence(row);
    const suggestedProducts = suggestedProductsFromEvidence(row);
    return {
        aiStatus,
        aiStatusLabel: aiStatus === AI_STATUS.VERIFIED
            ? (confidence ? `Verified Relevant — ${confidence}%` : 'Verified Relevant')
            : (aiStatus || 'Not yet verified'),
        aiVerificationTooltip: AI_VERIFICATION_TOOLTIP,
        confidencePercent: confidence,
        industryMatchPercent: industryMatch,
        contactCompletenessPercent: contactCompleteness,
        businessPotentialScore: potential.score,
        businessPotentialLabel: potential.label,
        verificationEvidence: evidence,
        suggestedProducts,
    };
}

export function completenessSortValue(row = {}) {
    return contactCompletenessPercent(row);
}
