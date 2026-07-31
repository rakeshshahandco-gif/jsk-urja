function norm(s = '') {
    return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const LEGAL_SUFFIXES = new Set(['pvt', 'ltd', 'limited', 'llp', 'inc', 'corp', 'private', 'co', 'company', 'industries', 'industry', 'enterprises']);

export function normalizeCompanyNameTokens(name = '') {
    return norm(name).split(' ').filter((t) => t && !LEGAL_SUFFIXES.has(t));
}

export function nameSimilarityRatio(a = '', b = '') {
    const A = new Set(normalizeCompanyNameTokens(a));
    const B = new Set(normalizeCompanyNameTokens(b));
    if (!A.size || !B.size) return 0;
    const inter = [...A].filter((x) => B.has(x)).length;
    const union = new Set([...A, ...B]).size;
    return union ? inter / union : 0;
}

/**
 * Infer relationship type with POSSIBLE_ labels unless strongly evidenced.
 * Never auto-merge related/branch variants.
 */
export function detectRelationshipType({
    seed = {},
    candidate = {},
    similarityScore = 0,
    geo = {},
    nameRatio = 0,
    settings = {},
} = {}) {
    const reasons = [];
    const riskSignals = [];
    const evidence = [];
    const seedName = seed.record?.companyName || seed.companyName || '';
    const candName = candidate.record?.companyName || candidate.companyName || '';
    const seedIndustry = norm(seed.classification?.parentIndustry || seed.parentIndustry);
    const candIndustry = norm(candidate.classification?.parentIndustry || candidate.parentIndustry);
    const seedCt = norm(seed.classification?.customerType || seed.customerType);
    const candCt = norm(candidate.classification?.customerType || candidate.customerType);
    const seedProd = norm(seed.recommendation?.primaryRecommendation?.productName || (seed.record?.productCategories || [])[0]);
    const candProd = norm(candidate.recommendation?.primaryRecommendation?.productName || (candidate.record?.productCategories || [])[0]);

    // Related-company / group / branch from name — review required, not merge
    if (nameRatio >= 0.75) {
        evidence.push({ type: 'name_similarity', value: nameRatio });
        if (geo.matchType === 'SAME_CITY' || geo.matchType === 'SAME_STATE' || geo.matchType === 'TEXTUAL_LOCATION_MATCH') {
            riskSignals.push('Branch-like name and location pattern — manual review required');
            return {
                relationshipType: 'POSSIBLE_BRANCH',
                reasons: ['Similar trading name with overlapping location signals'],
                riskSignals,
                evidence,
                recommendedNextAction: 'Manual branch/entity review — do not auto-merge',
            };
        }
        if (geo.matchType && geo.matchType !== 'NO_MATCH' && geo.matchType !== 'INSUFFICIENT_LOCATION') {
            riskSignals.push('Group/sister-concern name pattern — keep separate pending review');
            return {
                relationshipType: 'GROUP_COMPANY_VARIANT',
                reasons: ['High name similarity with geographic variation'],
                riskSignals,
                evidence,
                recommendedNextAction: 'Mark related or separate after review — do not auto-merge',
            };
        }
        return {
            relationshipType: 'RELATED_COMPANY',
            reasons: ['High name similarity — possible related/group company'],
            riskSignals: ['Do not auto-merge related-company variants'],
            evidence,
            recommendedNextAction: 'Related-company review',
        };
    }

    const sameIndustry = seedIndustry && candIndustry && seedIndustry === candIndustry;
    const sameProducts = seedProd && candProd && (seedProd === candProd || seedProd.includes(candProd) || candProd.includes(seedProd));
    const sameCt = seedCt && candCt && seedCt === candCt;

    // Competitor vs peer: need more than one shared keyword
    if (sameIndustry && sameProducts && sameCt && similarityScore >= 60) {
        reasons.push('Same industry, customer type and product opportunity signals');
        evidence.push({ type: 'multi_signal', industry: seedIndustry, customerType: seedCt, product: seedProd });
        return {
            relationshipType: 'POSSIBLE_COMPETITOR',
            reasons,
            riskSignals: ['Competitor status is possible, not definite'],
            evidence,
            recommendedNextAction: 'Review as possible competitor / industry peer',
        };
    }

    if (sameIndustry && similarityScore >= 45 && !(sameProducts && sameCt)) {
        return {
            relationshipType: 'INDUSTRY_PEER',
            reasons: ['Shared industry without full product+customer overlap'],
            riskSignals: [],
            evidence: [{ type: 'industry', value: seedIndustry }],
            recommendedNextAction: 'Review as industry peer',
        };
    }

    // Role-oriented possible relationships from customer type
    if (candCt.includes('dealer')) {
        return {
            relationshipType: 'POSSIBLE_DEALER',
            reasons: ['Candidate customer type suggests dealer'],
            riskSignals: [],
            evidence: [{ type: 'customer_type', value: candCt }],
            recommendedNextAction: 'Review as possible dealer prospect',
        };
    }
    if (candCt.includes('distributor')) {
        return {
            relationshipType: 'POSSIBLE_DISTRIBUTOR',
            reasons: ['Candidate customer type suggests distributor'],
            riskSignals: [],
            evidence: [{ type: 'customer_type', value: candCt }],
            recommendedNextAction: 'Review as possible distributor prospect',
        };
    }
    if (candCt.includes('oem') || candCt.includes('manufacturer')) {
        return {
            relationshipType: similarityScore >= 50 ? 'POSSIBLE_OEM' : 'POSSIBLE_CUSTOMER',
            reasons: [`Customer type ${candCt}`],
            riskSignals: [],
            evidence: [{ type: 'customer_type', value: candCt }],
            recommendedNextAction: 'Review as possible OEM/customer prospect',
        };
    }
    if (candCt.includes('supplier') || candCt.includes('vendor')) {
        return {
            relationshipType: 'POSSIBLE_SUPPLIER',
            reasons: ['Candidate customer type suggests supplier'],
            riskSignals: [],
            evidence: [{ type: 'customer_type', value: candCt }],
            recommendedNextAction: 'Review as possible supplier',
        };
    }
    if (candCt.includes('system integrator') || candCt.includes('integrator')) {
        return {
            relationshipType: 'POSSIBLE_SYSTEM_INTEGRATOR',
            reasons: ['Candidate appears to be a system integrator'],
            riskSignals: [],
            evidence: [{ type: 'customer_type', value: candCt }],
            recommendedNextAction: 'Review as possible system integrator prospect',
        };
    }
    if (candCt.includes('consultant') || candCt.includes('architect')) {
        return {
            relationshipType: 'POSSIBLE_CONSULTANT',
            reasons: ['Candidate customer type suggests consultant/architect'],
            riskSignals: [],
            evidence: [{ type: 'customer_type', value: candCt }],
            recommendedNextAction: 'Review as possible consultant',
        };
    }

    if (similarityScore >= Number(settings.minimumSimilarityScore || 35)) {
        return {
            relationshipType: 'SIMILAR_COMPANY',
            reasons: ['Weighted similarity above threshold'],
            riskSignals: [],
            evidence: [{ type: 'similarity_score', value: similarityScore }],
            recommendedNextAction: 'Review similar company candidate',
        };
    }

    if (similarityScore > 0 && similarityScore < Number(settings.minimumSimilarityScore || 35)) {
        return {
            relationshipType: 'MANUAL_REVIEW_REQUIRED',
            reasons: ['Low similarity — needs review before use'],
            riskSignals: ['Low confidence similarity'],
            evidence: [{ type: 'similarity_score', value: similarityScore }],
            recommendedNextAction: 'Manual research required',
        };
    }

    return {
        relationshipType: 'UNRELATED',
        reasons: ['Insufficient similarity signals'],
        riskSignals: [],
        evidence: [],
        recommendedNextAction: 'No action',
    };
}
