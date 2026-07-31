/**
 * Checkpoint 8 (Phase B) - deterministic evidence-based genuineness verification
 * (mandatory fallback, no paid AI required).
 *
 * Genuineness answers: "is this a real, contactable, independently verifiable business",
 * NOT "is this a good product/industry match" (that is CP7 qualification's job).
 */
import { RULE_ENGINE_VERSION } from './constants.js';

const FREE_EMAIL_DOMAINS = [
    'gmail.com', 'yahoo.com', 'yahoo.co.in', 'hotmail.com', 'outlook.com',
    'rediffmail.com', 'icloud.com', 'protonmail.com', 'live.com', 'aol.com',
];

const BROKEN_OR_PARKED_SIGNALS = [
    'domain for sale', 'this domain is for sale', 'parked domain', 'parked free',
    'buy this domain', 'under construction', 'coming soon', 'site not found',
    '404 not found', 'page not found', 'account suspended', 'website expired',
    'default web page', 'this account has been suspended',
];

const MANUFACTURER_CLAIM_KEYWORDS = [
    'manufacturer', 'manufacturing company', 'we manufacture', 'we are manufacturer',
    'factory', 'oem', 'odm', 'production unit', 'in-house manufacturing',
];

const TRADER_DISTRIBUTOR_KEYWORDS = [
    'distributor', 'dealer', 'importer', 'authorized partner', 'reseller',
    'supplier', 'trading company', 'wholesaler', 'stockist',
];

function norm(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function includesAny(text, list) {
    const t = norm(text);
    const hits = [];
    for (const k of list) {
        if (t.includes(norm(k))) hits.push(k);
    }
    return hits;
}

function emailDomain(value) {
    const at = String(value || '').lastIndexOf('@');
    if (at < 0) return '';
    return norm(value.slice(at + 1));
}

function tokenize(text) {
    return norm(text)
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(' ')
        .filter((t) => t.length >= 3);
}

function tokenOverlap(a, b) {
    const ta = new Set(tokenize(a));
    const tb = new Set(tokenize(b));
    if (!ta.size || !tb.size) return 0;
    let common = 0;
    for (const t of ta) if (tb.has(t)) common += 1;
    return common / Math.min(ta.size, tb.size);
}

function collectEvidenceUrls({ enrichment = {}, rawCapture = {} }) {
    const urls = new Set();
    const push = (u) => {
        if (u && typeof u === 'string') urls.add(u.trim());
    };
    push(enrichment.websiteUrl);
    push(enrichment.directoryProfileUrl);
    for (const p of enrichment.phones || []) push(p.sourceUrl);
    for (const p of enrichment.whatsappNumbers || []) push(p.sourceUrl);
    for (const e of enrichment.emails || []) push(e.sourceUrl);
    for (const a of enrichment.addresses || []) push(a.sourceUrl);
    push(enrichment.facebook?.url);
    push(enrichment.instagram?.url);
    push(enrichment.linkedin?.url);
    push(enrichment.youtube?.url);
    for (const ev of enrichment.sourceEvidence || []) push(ev.sourceUrl);
    push(rawCapture.resultUrlOriginal || rawCapture.resultUrlNormalized);
    return [...urls].filter(Boolean).slice(0, 40);
}

function buildOwnSiteEvidenceText(enrichment = {}) {
    return [
        enrichment.manufacturerEvidence || '',
        (enrichment.productsServices || []).join(' '),
        (enrichment.sourceEvidence || []).map((e) => e.value).join(' '),
        (enrichment.pagesVisited || []).length ? 'has_pages_visited' : '',
    ].join(' \n ');
}

function buildCaptureOnlyText(rawCapture = {}) {
    return [rawCapture.title || '', rawCapture.snippet || ''].join(' \n ');
}

/**
 * Classify manufacturer evidence strength. Never labels a company a verified
 * manufacturer purely on a search-result title/snippet claim.
 */
function classifyManufacturerEvidence({ enrichment = {}, rawCapture = {}, businessType = '' }) {
    const ownText = buildOwnSiteEvidenceText(enrichment);
    const captureOnlyText = buildCaptureOnlyText(rawCapture);
    const ownHits = includesAny(ownText, MANUFACTURER_CLAIM_KEYWORDS);
    const captureHits = includesAny(captureOnlyText, MANUFACTURER_CLAIM_KEYWORDS);
    const traderHits = includesAny(`${ownText} ${captureOnlyText}`, TRADER_DISTRIBUTOR_KEYWORDS);

    if (ownHits.length) {
        const hasMultiPageEvidence = (enrichment.sourceEvidence || []).length >= 1
            || (enrichment.pagesVisited || []).length >= 2;
        return {
            manufacturerEvidence: hasMultiPageEvidence ? 'manufacturer_evidence_strong' : 'manufacturer_evidence_possible',
            manufacturerHits: ownHits,
        };
    }
    if (captureHits.length && !ownHits.length) {
        return {
            manufacturerEvidence: 'unsupported_manufacturer_claim',
            manufacturerHits: captureHits,
        };
    }
    if (traderHits.length || ['distributor', 'dealer', 'supplier', 'importer'].includes(businessType)) {
        return { manufacturerEvidence: 'trader_or_distributor', manufacturerHits: traderHits };
    }
    return { manufacturerEvidence: 'unknown', manufacturerHits: [] };
}

function detectConflicts({ enrichment = {}, qualification = {}, rawCapture = {} }) {
    const conflicts = [];

    const captureTitle = rawCapture.title || '';
    const companyName = enrichment.companyName || enrichment.legalOrDisplayedName || '';
    if (captureTitle && companyName) {
        const overlap = tokenOverlap(captureTitle, companyName);
        if (overlap < 0.15 && tokenize(companyName).length >= 2) {
            conflicts.push('company_name_mismatch_with_search_result');
        }
    }

    if (enrichment.companyName && enrichment.legalOrDisplayedName
        && norm(enrichment.companyName) !== norm(enrichment.legalOrDisplayedName)
        && tokenOverlap(enrichment.companyName, enrichment.legalOrDisplayedName) < 0.2) {
        conflicts.push('company_name_conflicts_with_legal_name');
    }

    if ((enrichment.phones || []).some((p) => p.reviewRequired)) {
        conflicts.push('phone_number_requires_review');
    }

    if ((enrichment.conflictingValues || []).length) {
        conflicts.push(...enrichment.conflictingValues.slice(0, 5).map((v) => `enrichment_conflict:${v}`));
    }

    if ((qualification.unmatchedOrConflictingEvidence || []).includes('location_mismatch')) {
        conflicts.push('location_mismatch');
    }

    return [...new Set(conflicts)];
}

/**
 * @param {{ enrichment, qualification, rawCapture, productHint }} input
 */
export function evaluateGenuineness(input = {}) {
    const { enrichment = {}, qualification = {}, rawCapture = {} } = input;

    const positiveSignals = [];
    const warningSignals = [];
    const missingCriticalFields = [];

    const websiteUrl = enrichment.websiteUrl || '';
    const companyName = enrichment.companyName || '';
    const phones = enrichment.phones || [];
    const emails = enrichment.emails || [];
    const addresses = enrichment.addresses || [];
    const isDirectorySource = Boolean(enrichment.isDirectorySource);
    const businessType = qualification.businessType || enrichment.businessType || 'unknown';
    const evidenceUrls = collectEvidenceUrls({ enrichment, rawCapture });

    const { manufacturerEvidence, manufacturerHits } = classifyManufacturerEvidence({
        enrichment, rawCapture, businessType,
    });
    if (manufacturerEvidence === 'unsupported_manufacturer_claim') {
        warningSignals.push(`manufacturer_claim_unsupported_by_website_evidence:${manufacturerHits.slice(0, 3).join(',')}`);
    } else if (manufacturerEvidence === 'manufacturer_evidence_strong') {
        positiveSignals.push('manufacturer_evidence_on_own_site');
    }

    // --- Directory / marketplace only: identity of underlying supplier not independently verified ---
    if (isDirectorySource || businessType === 'directory_marketplace') {
        return finalize({
            genuinenessDecision: 'directory_or_marketplace_only',
            genuinenessScore: 30,
            genuinenessConfidence: 'medium',
            verificationReason: 'Source is a directory/marketplace listing; the underlying supplier identity has not been independently verified against a first-party website.',
            positiveSignals,
            warningSignals: [...warningSignals, 'directory_or_marketplace_source'],
            conflictingEvidence: [],
            missingCriticalFields: websiteUrl ? [] : ['first_party_website'],
            evidenceUrls,
            manufacturerEvidence,
        });
    }

    // --- Broken / parked website signals ---
    const blob = [
        buildOwnSiteEvidenceText(enrichment),
        buildCaptureOnlyText(rawCapture),
    ].join(' \n ');
    const brokenHits = includesAny(blob, BROKEN_OR_PARKED_SIGNALS);
    if (brokenHits.length) {
        return finalize({
            genuinenessDecision: 'suspected_unreliable',
            genuinenessScore: 15,
            genuinenessConfidence: 'high',
            verificationReason: `Website/evidence shows broken, parked, or expired-domain signals (${brokenHits.slice(0, 3).join(', ')}).`,
            positiveSignals,
            warningSignals: [...warningSignals, ...brokenHits.map((h) => `broken_site_signal:${h}`)],
            conflictingEvidence: [],
            missingCriticalFields,
            evidenceUrls,
            manufacturerEvidence,
        });
    }

    // --- Conflicting evidence (name/phone/location mismatches) -> always human review ---
    const conflictingEvidence = detectConflicts({ enrichment, qualification, rawCapture });
    if (conflictingEvidence.length) {
        return finalize({
            genuinenessDecision: 'human_review_required',
            genuinenessScore: 45,
            genuinenessConfidence: 'low',
            verificationReason: `Conflicting evidence found (${conflictingEvidence.slice(0, 3).join(', ')}) — human confirmation required before treating as genuine.`,
            positiveSignals,
            warningSignals,
            conflictingEvidence,
            missingCriticalFields,
            evidenceUrls,
            manufacturerEvidence,
        });
    }

    // --- Critical field checks ---
    if (!websiteUrl) missingCriticalFields.push('website');
    if (!phones.length) missingCriticalFields.push('phone');
    if (!companyName) missingCriticalFields.push('companyName');

    // --- Positive signal collection ---
    if (websiteUrl) positiveSignals.push('website_present');
    const hasVerifiedPhone = phones.some((p) => ['verified_from_tel_link', 'verified_from_structured_data'].includes(p.confidence));
    if (hasVerifiedPhone) positiveSignals.push('verified_phone_present');
    else if (phones.length) positiveSignals.push('phone_present');
    if (emails.length) positiveSignals.push('email_present');
    if (addresses.length || enrichment.city) positiveSignals.push('address_present');
    if (companyName) positiveSignals.push('company_name_present');
    const hasSocial = Boolean(enrichment.facebook?.url || enrichment.instagram?.url || enrichment.linkedin?.url);
    if (hasSocial) positiveSignals.push('social_profile_present');
    // Absence of social profiles is intentionally NOT penalized (absence of social != fake).
    if ((enrichment.sourceEvidence || []).length >= 2 || (enrichment.pagesVisited || []).length >= 2) {
        positiveSignals.push('multi_page_evidence');
    }
    if (qualification.systemDecision === 'strong_match') positiveSignals.push('qualification_strong_match');
    else if (qualification.systemDecision === 'possible_match') positiveSignals.push('qualification_possible_match');

    // --- Warning signals (mild, do not by themselves mean fake) ---
    if (emails.length && emails.every((e) => FREE_EMAIL_DOMAINS.includes(emailDomain(e.value)))) {
        // Free email alone is not a fraud signal — recorded as a mild warning only.
        warningSignals.push('free_email_domain_only');
    }
    if (!hasVerifiedPhone && phones.length) {
        warningSignals.push('phone_not_independently_verified');
    }

    // --- Scoring ---
    let score = 40;
    if (websiteUrl) score += 15;
    if (hasVerifiedPhone) score += 20;
    else if (phones.length) score += 8;
    if (emails.length) score += 5;
    if (addresses.length || enrichment.city) score += 5;
    if (companyName) score += 5;
    if (hasSocial) score += 5;
    if (positiveSignals.includes('multi_page_evidence')) score += 8;
    if (qualification.systemDecision === 'strong_match') score += 7;
    else if (qualification.systemDecision === 'possible_match') score += 3;
    if (manufacturerEvidence === 'manufacturer_evidence_strong') score += 5;
    if (manufacturerEvidence === 'unsupported_manufacturer_claim') score -= 5;
    score -= warningSignals.length * 4;
    score -= missingCriticalFields.length * 12;
    score = Math.max(0, Math.min(100, Math.round(score)));

    let genuinenessDecision;
    let genuinenessConfidence;
    let verificationReason;

    if (missingCriticalFields.length >= 2) {
        genuinenessDecision = score >= 35 ? 'human_review_required' : 'suspected_unreliable';
        genuinenessConfidence = 'low';
        verificationReason = `Multiple critical identity fields are missing (${missingCriticalFields.join(', ')}) — insufficient evidence to confirm genuineness safely.`;
    } else if (score >= 80 && hasVerifiedPhone && websiteUrl && companyName) {
        genuinenessDecision = 'verified_genuine';
        genuinenessConfidence = 'high';
        verificationReason = `Consistent, independently verifiable evidence: ${positiveSignals.slice(0, 6).join(', ')}.`;
    } else if (score >= 60) {
        genuinenessDecision = 'likely_genuine';
        genuinenessConfidence = 'medium';
        verificationReason = `Reasonably consistent evidence of a real business (${positiveSignals.slice(0, 6).join(', ')}), though not fully independently verified.`;
    } else if (score >= 40) {
        genuinenessDecision = 'human_review_required';
        genuinenessConfidence = 'low';
        verificationReason = 'Evidence is inconclusive — some identity signals present but not strong enough to confirm genuineness automatically.';
    } else if (score >= 20) {
        genuinenessDecision = 'suspected_unreliable';
        genuinenessConfidence = 'low';
        verificationReason = 'Very weak or thin evidence of a real, contactable business.';
    } else {
        genuinenessDecision = 'rejected_unusable';
        genuinenessConfidence = 'medium';
        verificationReason = 'No usable identity evidence (no website, phone, or company name) — cannot treat as a genuine lead.';
    }

    return finalize({
        genuinenessDecision,
        genuinenessScore: score,
        genuinenessConfidence,
        verificationReason,
        positiveSignals,
        warningSignals,
        conflictingEvidence,
        missingCriticalFields,
        evidenceUrls,
        manufacturerEvidence,
    });
}

function finalize(result) {
    return {
        ...result,
        verificationMethod: 'rule_based',
        ruleEngineVersion: RULE_ENGINE_VERSION,
        aiModel: '',
        aiSchemaVersion: '',
    };
}

export { RULE_ENGINE_VERSION };
