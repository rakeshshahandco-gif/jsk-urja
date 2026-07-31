import { ENGINE_VERSION } from './constants.js';
import { normalizeSimilaritySettings, settingsFingerprint } from './settings.service.js';
import { detectRelationshipType, normalizeCompanyNameTokens, nameSimilarityRatio } from './relationship.service.js';
import { compareGeography } from './nearby.service.js';

function clamp(n, min = 0, max = 100) {
    return Math.max(min, Math.min(max, Math.round(Number(n) || 0)));
}

function uniq(list = []) {
    return [...new Set((list || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

function tokens(text = '') {
    return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
}

function overlapScore(a = [], b = [], maxScore = 10) {
    const A = new Set((a || []).map((x) => String(x || '').toLowerCase()).filter(Boolean));
    const B = new Set((b || []).map((x) => String(x || '').toLowerCase()).filter(Boolean));
    if (!A.size || !B.size) return { score: 0, matches: [] };
    const matches = [...A].filter((x) => B.has(x));
    const ratio = matches.length / Math.max(1, Math.min(A.size, B.size));
    return { score: Math.round(ratio * maxScore), matches };
}

function textOverlap(a = '', b = '', maxScore = 8) {
    const ta = new Set(tokens(a));
    const tb = new Set(tokens(b));
    if (!ta.size || !tb.size) return { score: 0, matches: [] };
    const matches = [...ta].filter((x) => tb.has(x)).slice(0, 12);
    const ratio = matches.length / Math.max(1, Math.min(ta.size, tb.size));
    return { score: Math.round(Math.min(1, ratio * 1.5) * maxScore), matches };
}

function dim(id, label, score, maxScore, reason, evidence = []) {
    const max = Math.max(0, Number(maxScore) || 0);
    const current = Math.max(0, Math.min(max, Math.round(Number(score) || 0)));
    return { id, label, weight: max, maxScore: max, score: current, reason, evidence: evidence.slice(0, 8), active: true };
}

/**
 * Compare one seed company snapshot to one candidate snapshot.
 * Does not invent companies. Name similarity used mainly for relationship review.
 */
export function scoreSimilarityPair({
    seed = {},
    candidate = {},
    settings: rawSettings = null,
} = {}) {
    const settings = normalizeSimilaritySettings(rawSettings || {});
    const active = (settings.dimensions || []).filter((d) => d.active !== false && Number(d.maxScore) > 0);
    const byId = Object.fromEntries(active.map((d) => [d.id, d]));

    const seedIndustry = seed.classification?.parentIndustry || seed.parentIndustry || '';
    const candIndustry = candidate.classification?.parentIndustry || candidate.parentIndustry || '';
    const seedSub = seed.classification?.subIndustry || seed.subIndustry || '';
    const candSub = candidate.classification?.subIndustry || candidate.subIndustry || '';
    const seedCt = seed.classification?.customerType || seed.customerType || seed.relevance?.customerType || '';
    const candCt = candidate.classification?.customerType || candidate.customerType || candidate.relevance?.customerType || '';
    const seedProducts = uniq([
        ...(seed.record?.productCategories || []),
        ...(seed.classification?.productSignals || []),
        seed.recommendation?.primaryRecommendation?.productName,
    ]);
    const candProducts = uniq([
        ...(candidate.record?.productCategories || []),
        ...(candidate.classification?.productSignals || []),
        candidate.recommendation?.primaryRecommendation?.productName,
    ]);

    const dimensions = [];
    const reasons = [];
    const riskSignals = [];

    if (byId.industry_match) {
        const max = byId.industry_match.maxScore;
        const same = seedIndustry && candIndustry && seedIndustry.toLowerCase() === candIndustry.toLowerCase();
        const s = same ? max : 0;
        if (same) reasons.push(`Same primary industry: ${seedIndustry}`);
        dimensions.push(dim('industry_match', byId.industry_match.label, s, max, same ? `Industry match ${seedIndustry}` : 'No industry match', [seedIndustry, candIndustry].filter(Boolean)));
    }

    if (byId.sub_industry_match) {
        const max = byId.sub_industry_match.maxScore;
        const same = seedSub && candSub && seedSub.toLowerCase() === candSub.toLowerCase();
        const s = same ? max : 0;
        if (same) reasons.push(`Same sub-industry: ${seedSub}`);
        dimensions.push(dim('sub_industry_match', byId.sub_industry_match.label, s, max, same ? `Sub-industry match ${seedSub}` : 'No sub-industry match'));
    }

    if (byId.customer_type_match) {
        const max = byId.customer_type_match.maxScore;
        const same = seedCt && candCt && seedCt.toLowerCase() === candCt.toLowerCase();
        const s = same ? max : 0;
        if (same) reasons.push(`Same customer type: ${seedCt}`);
        dimensions.push(dim('customer_type_match', byId.customer_type_match.label, s, max, same ? `Customer type ${seedCt}` : 'No customer-type match'));
    }

    if (byId.product_match) {
        const max = byId.product_match.maxScore;
        const ov = overlapScore(seedProducts, candProducts, max);
        if (ov.matches.length) reasons.push(`Matching products/services: ${ov.matches.slice(0, 3).join(', ')}`);
        dimensions.push(dim('product_match', byId.product_match.label, ov.score, max, ov.matches.length ? `Product overlap` : 'No product overlap', ov.matches));
    }

    if (byId.opportunity_match) {
        const max = byId.opportunity_match.maxScore;
        const sp = seed.recommendation?.primaryRecommendation?.productName || '';
        const cp = candidate.recommendation?.primaryRecommendation?.productName || '';
        const same = sp && cp && sp.toLowerCase() === cp.toLowerCase();
        const s = same ? max : (sp && cp ? Math.round(max * 0.3) : 0);
        if (same) reasons.push(`Same product opportunity: ${sp}`);
        dimensions.push(dim('opportunity_match', byId.opportunity_match.label, s, max, same ? `Opportunity ${sp}` : 'Opportunity differs/unavailable'));
    }

    if (byId.target_market_fit) {
        const max = byId.target_market_fit.maxScore;
        const sr = Number(seed.relevance?.relevanceScore);
        const cr = Number(candidate.relevance?.relevanceScore);
        let s = 0;
        if (seed.relevance?.status === 'RELEVANT' && candidate.relevance?.status === 'RELEVANT') {
            s = Math.round(max * 0.9);
            reasons.push('Both companies are relevant to target market');
        } else if (Number.isFinite(sr) && Number.isFinite(cr) && Math.abs(sr - cr) <= 15) {
            s = Math.round(max * 0.5);
        }
        dimensions.push(dim('target_market_fit', byId.target_market_fit.label, s, max, `Seed relevance ${seed.relevance?.status || 'n/a'}; candidate ${candidate.relevance?.status || 'n/a'}`));
    }

    if (byId.description_match) {
        const max = byId.description_match.maxScore;
        const ov = textOverlap(
            seed.record?.businessDescription || seed.profile?.structuredSections?.companyOverview?.description || '',
            candidate.record?.businessDescription || candidate.profile?.structuredSections?.companyOverview?.description || '',
            max,
        );
        if (ov.score > 0) reasons.push('Business description keyword overlap');
        dimensions.push(dim('description_match', byId.description_match.label, ov.score, max, ov.matches.length ? `Shared keywords: ${ov.matches.slice(0, 4).join(', ')}` : 'No description overlap', ov.matches));
    }

    const geo = compareGeography(seed.record || {}, candidate.record || {}, settings);
    if (byId.geographic_match) {
        const max = byId.geographic_match.maxScore;
        dimensions.push(dim('geographic_match', byId.geographic_match.label, geo.score * (max / 100), max, geo.reason, [geo.matchType]));
        if (geo.score >= 50) reasons.push(geo.reason);
    }

    if (byId.contact_role_similarity) {
        const max = byId.contact_role_similarity.maxScore;
        const sr = seed.contact?.primaryContact?.contactRoleCategory || '';
        const cr = candidate.contact?.primaryContact?.contactRoleCategory || '';
        const same = sr && cr && sr.toLowerCase() === cr.toLowerCase();
        dimensions.push(dim('contact_role_similarity', byId.contact_role_similarity.label, same ? max : 0, max, same ? `Similar contact role ${sr}` : 'Contact roles differ/unavailable'));
    }

    if (byId.lead_score_proximity) {
        const max = byId.lead_score_proximity.maxScore;
        const ss = Number(seed.score?.finalScore);
        const cs = Number(candidate.score?.finalScore);
        let s = 0;
        if (Number.isFinite(ss) && Number.isFinite(cs)) {
            const diff = Math.abs(ss - cs);
            s = diff <= 10 ? max : diff <= 20 ? Math.round(max * 0.6) : diff <= 35 ? Math.round(max * 0.3) : 0;
            if (s) reasons.push(`Lead-score proximity (${ss} vs ${cs})`);
        }
        dimensions.push(dim('lead_score_proximity', byId.lead_score_proximity.label, s, max, Number.isFinite(ss) && Number.isFinite(cs) ? `Scores ${ss} / ${cs}` : 'Lead score unavailable'));
    }

    if (byId.source_category_match) {
        const max = byId.source_category_match.maxScore;
        const a = seed.record?.sourcePlatform || seed.record?.sourceType || '';
        const b = candidate.record?.sourcePlatform || candidate.record?.sourceType || '';
        const same = a && b && a === b;
        dimensions.push(dim('source_category_match', byId.source_category_match.label, same ? max : 0, max, same ? `Same source category ${a}` : 'Source categories differ'));
    }

    if (byId.entity_confidence) {
        const max = byId.entity_confidence.maxScore;
        const dup = String(candidate.record?.duplicateStatus || candidate.duplicateEntityStatus || '').toUpperCase();
        let s = max;
        if (/POSSIBLE_DUPLICATE|RELATED|AMBIGU|EXACT_DUPLICATE|BRANCH|GROUP/.test(dup)) {
            s = Math.round(max * 0.25);
            riskSignals.push(`Duplicate/entity ambiguity: ${dup}`);
        }
        dimensions.push(dim('entity_confidence', byId.entity_confidence.label, s, max, dup || 'No duplicate flag'));
    }

    // Negative/exclusion conflicts
    const seedExcl = [...(seed.classification?.matchedExclusionTerms || [])].map((x) => String(x).toLowerCase());
    const candExcl = [...(candidate.classification?.matchedExclusionTerms || [])].map((x) => String(x).toLowerCase());
    let penalty = 0;
    if (seedExcl.length || candExcl.length) {
        penalty += 8;
        riskSignals.push('Exclusion keyword conflict present');
    }
    if (candidate.relevance?.status === 'IRRELEVANT') {
        penalty += 10;
        riskSignals.push('Candidate marked irrelevant');
    }
    if (candidate.classification?.status === 'MULTIPLE_POSSIBILITIES') {
        penalty += 4;
        riskSignals.push('Candidate has conflicting industry possibilities');
    }

    const activeMax = dimensions.reduce((a, d) => a + Number(d.maxScore || 0), 0) || 1;
    const raw = dimensions.reduce((a, d) => a + Number(d.score || 0), 0);
    let similarityScore = clamp((raw / activeMax) * 100 - penalty);

    // Name similarity must NOT dominate general ranking
    const nameRatio = nameSimilarityRatio(seed.record?.companyName || seed.companyName, candidate.record?.companyName || candidate.companyName);
    if (!settings.nameSimilarityForRelationshipOnly && nameRatio >= 0.85) {
        similarityScore = clamp(similarityScore + 5);
    } else if (nameRatio >= 0.7 && !(seedIndustry && candIndustry && seedIndustry.toLowerCase() === candIndustry.toLowerCase())) {
        // Same-ish name but different/missing industry: do not inflate similarity
        riskSignals.push('Name similarity present without shared industry evidence');
        similarityScore = Math.min(similarityScore, 40);
    }

    const relationship = detectRelationshipType({
        seed,
        candidate,
        similarityScore,
        geo,
        nameRatio,
        settings,
    });

    let confidence = 45;
    const parts = [
        Number(seed.classification?.confidenceScore),
        Number(candidate.classification?.confidenceScore),
        Number(seed.score?.confidence),
        Number(candidate.score?.confidence),
    ].filter((n) => Number.isFinite(n));
    if (parts.length) confidence = clamp(parts.reduce((a, b) => a + b, 0) / parts.length);
    if (similarityScore < Number(settings.requireReviewBelowConfidence || 45)) {
        // keep
    }

    let status = 'DISCOVERED';
    if (similarityScore >= Number(settings.highPotentialThreshold || 70)) status = 'HIGH_POTENTIAL';
    else if (similarityScore >= Number(settings.minimumSimilarityScore || 35)) status = 'SIMILAR';
    else status = 'LOW_CONFIDENCE';

    if (relationship.relationshipType === 'POSSIBLE_COMPETITOR') status = 'POSSIBLE_COMPETITOR';
    if (['RELATED_COMPANY', 'GROUP_COMPANY_VARIANT', 'POSSIBLE_SISTER_CONCERN', 'POSSIBLE_PARENT', 'POSSIBLE_SUBSIDIARY'].includes(relationship.relationshipType)) {
        status = 'RELATED_COMPANY_REVIEW';
    }
    if (relationship.relationshipType === 'POSSIBLE_BRANCH') status = 'POSSIBLE_BRANCH_REVIEW';
    if (/EXACT_DUPLICATE|CONFIRMED_DUPLICATE/.test(String(candidate.record?.duplicateStatus || '').toUpperCase())) status = 'DUPLICATE';
    if (candidate.existingCrmStatus === 'CUSTOMER' || candidate.existingCrmStatus === 'SUPPLIER' || candidate.existingCrmStatus === 'LEAD') {
        status = 'ALREADY_IN_CRM';
    }
    if (confidence < Number(settings.requireReviewBelowConfidence || 45) && status === 'SIMILAR') {
        // leave as SIMILAR but flag review in relationship if needed
    }

    const sourceUrls = uniq([
        seed.record?.website, seed.record?.sourceUrl,
        candidate.record?.website, candidate.record?.sourceUrl,
        ...(candidate.profile?.sourceUrls || []),
    ]);

    return {
        seedCompanyName: seed.record?.companyName || seed.companyName || '',
        candidateCompanyName: candidate.record?.companyName || candidate.companyName || '',
        similarityScore,
        confidence,
        relationshipType: relationship.relationshipType,
        primaryReasons: uniq([...reasons, ...(relationship.reasons || [])]).slice(0, 12),
        matchingIndustries: uniq([seedIndustry, candIndustry].filter((x, i, arr) => x && arr.filter((y) => y.toLowerCase() === x.toLowerCase()).length > 1)),
        matchingSubIndustries: uniq([seedSub, candSub].filter(Boolean).filter((x, i, arr) => arr.filter((y) => y.toLowerCase() === x.toLowerCase()).length > 1)),
        matchingCustomerTypes: uniq([seedCt, candCt].filter(Boolean).filter((x, i, arr) => arr.filter((y) => y.toLowerCase() === x.toLowerCase()).length > 1)),
        matchingProducts: overlapScore(seedProducts, candProducts, 10).matches,
        matchingOpportunitySignals: uniq([
            seed.recommendation?.primaryRecommendation?.productName,
            candidate.recommendation?.primaryRecommendation?.productName,
        ].filter((x, i, arr) => x && arr.filter((y) => String(y).toLowerCase() === String(x).toLowerCase()).length > 1)),
        geographicProximity: geo,
        sourceAgreement: uniq([seed.record?.sourcePlatform, candidate.record?.sourcePlatform].filter(Boolean)),
        riskSignals: uniq([...riskSignals, ...(relationship.riskSignals || [])]),
        existingCrmStatus: candidate.existingCrmStatus || 'UNKNOWN',
        duplicateEntityStatus: candidate.record?.duplicateStatus || candidate.duplicateEntityStatus || '',
        candidateLeadScore: Number.isFinite(Number(candidate.score?.finalScore)) ? Number(candidate.score.finalScore) : null,
        recommendedNextAction: relationship.recommendedNextAction,
        evidence: [
            ...dimensions.filter((d) => d.score > 0).map((d) => ({ type: 'dimension', id: d.id, reason: d.reason, score: d.score })),
            ...(relationship.evidence || []),
        ].slice(0, 40),
        sourceUrls,
        dimensionScores: dimensions,
        status,
        engineUsed: 'rule_based',
        modelVersion: ENGINE_VERSION,
        settingsVersion: settingsFingerprint(settings),
        fallbackUsed: false,
        noAutoCrmCreate: true,
        noAutoCommunications: true,
        noAutoPaidProvider: true,
        nameTokens: {
            seed: normalizeCompanyNameTokens(seed.record?.companyName || seed.companyName),
            candidate: normalizeCompanyNameTokens(candidate.record?.companyName || candidate.companyName),
            nameRatio,
        },
        analysisTimestamp: new Date().toISOString(),
    };
}
