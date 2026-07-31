import {
    ENGINE_VERSION,
    DEFAULT_WEIGHTS,
    DEFAULT_AMBIGUOUS_CONTEXTS,
} from './constants.js';

function uniq(list = []) {
    return [...new Set((list || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

function normalize(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9\s./:-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(text) {
    return normalize(text).split(/\s+/).filter((t) => t.length > 1);
}

function containsAny(haystack, words = []) {
    const hits = [];
    for (const w of uniq(words).map(normalize)) {
        if (!w) continue;
        if (haystack.includes(w)) hits.push(w);
    }
    return hits;
}

function buildCorpus(record = {}, classification = {}) {
    return normalize([
        record.companyName,
        record.legalName,
        record.businessDescription,
        record.natureOfBusiness,
        record.websiteTitle,
        record.websiteMetaDescription,
        record.aboutPageText,
        record.productPageText,
        ...(record.productCategories || []),
        ...(record.keywords || []),
        ...(record.publicProductNames || []),
        record.indiamartDescription,
        ...(record.indiamartCategories || []),
        record.facebookCategory,
        record.instagramCategory,
        record.instagramBio,
        record.city,
        record.stateProvince || record.state,
        record.country,
        classification.primaryIndustry,
        classification.parentIndustry,
        classification.subIndustry,
        ...(classification.positiveKeywordsFound || []),
        ...(classification.productSignals || []),
        ...(classification.websiteSignals || []),
        ...(classification.evidenceSnippets || []),
    ].filter(Boolean).join(' \n '));
}

export function defaultRelevanceSettings(settingsDoc = {}) {
    const raw = settingsDoc?.aiLeadIntelligence || {};
    const tm = raw.targetMarket || {};
    return {
        enabled: raw.enabled === true,
        relevantMinScore: Number(tm.relevantMinScore) || 70,
        possiblyRelevantMinScore: Number(tm.possiblyRelevantMinScore) || 45,
        targetParentIndustries: uniq(tm.targetParentIndustries || []),
        targetSubIndustries: uniq(tm.targetSubIndustries || []),
        targetProducts: uniq(tm.targetProducts || []),
        targetLocations: uniq(tm.targetLocations || []),
        exclusionKeywords: uniq(tm.exclusionKeywords || []),
        negativeKeywords: uniq(tm.negativeKeywords || []),
        weights: { ...DEFAULT_WEIGHTS, ...(tm.weights || {}) },
        ambiguousContexts: Array.isArray(tm.ambiguousContexts) && tm.ambiguousContexts.length
            ? tm.ambiguousContexts
            : DEFAULT_AMBIGUOUS_CONTEXTS,
    };
}

function evaluateAmbiguous(corpus, searchKeyword, contexts, weights) {
    const search = normalize(searchKeyword);
    const signals = [];
    let penalty = 0;
    let forceIrrelevant = false;
    let reason = '';

    for (const ctx of contexts || []) {
        const triggers = (ctx.triggerTokens || []).map(normalize).filter(Boolean);
        const neg = (ctx.negativeContexts || []).map(normalize).filter(Boolean);
        const pos = (ctx.positiveContexts || []).map(normalize).filter(Boolean);
        const triggerHit = triggers.some((t) => search.includes(t) || corpus.includes(t));
        if (!triggerHit) continue;
        const negHit = neg.filter((n) => corpus.includes(n));
        const posHit = pos.filter((p) => corpus.includes(p));
        if (negHit.length && !posHit.length) {
            forceIrrelevant = true;
            penalty += weights.ambiguousContextPenalty;
            reason = ctx.reason || 'Ambiguous commercial term without supporting product evidence';
            signals.push({ rule: 'ambiguous_context', detail: reason, negHit, triggers });
        } else if (negHit.length && posHit.length) {
            signals.push({ rule: 'ambiguous_context_resolved', detail: 'Ambiguous term resolved by positive product context', posHit, negHit });
        }
    }
    return { forceIrrelevant, penalty, reason, signals };
}

/**
 * Explainable relevance / target-market fit engine.
 * Generic and company-configurable — no hardcoded CRM product catalog.
 */
export function scoreLeadRelevance({
    record = {},
    classification = null,
    searchContext = {},
    settingsDoc = null,
    opportunityMaps = [],
} = {}) {
    const cfg = defaultRelevanceSettings(settingsDoc || {});
    const weights = cfg.weights;
    const corpus = buildCorpus(record, classification || {});
    const searchKeyword = String(searchContext.searchKeyword || record.searchKeyword || '').trim();
    const selectedIndustry = String(searchContext.selectedIndustry || '').trim();
    const selectedProduct = String(searchContext.selectedProduct || '').trim();
    const selectedLocation = String(searchContext.selectedLocation || '').trim();

    const signals = [];
    let score = 0;
    const matchingProducts = [];
    const conflictingKeywords = [];
    let exclusionReason = '';

    // Classification already marked irrelevant
    if (classification?.status === 'IRRELEVANT') {
        score -= weights.classificationIrrelevantPenalty;
        exclusionReason = classification.manualReviewReason || 'Classification marked IRRELEVANT';
        signals.push({ rule: 'classification_irrelevant', detail: exclusionReason, delta: -weights.classificationIrrelevantPenalty });
    }

    // Ambiguous keyword handling against search intent
    const amb = evaluateAmbiguous(corpus, searchKeyword, cfg.ambiguousContexts, weights);
    score -= amb.penalty;
    signals.push(...amb.signals);
    if (amb.forceIrrelevant) exclusionReason = amb.reason;

    // Search keyword overlap
    const searchTokens = tokens(searchKeyword).filter((t) => t.length > 2);
    const searchHits = searchTokens.filter((t) => corpus.includes(t));
    if (searchHits.length) {
        const delta = Math.min(weights.searchKeywordMatch * 2, searchHits.length * (weights.searchKeywordMatch / Math.max(1, searchTokens.length)) * searchTokens.length);
        const add = Math.round(Math.min(weights.searchKeywordMatch, delta + searchHits.length * 4));
        score += add;
        signals.push({ rule: 'search_keyword_match', detail: `Matched search tokens: ${searchHits.join(', ')}`, hits: searchHits, delta: add });
    } else if (searchTokens.length) {
        const miss = searchTokens.filter((t) => !corpus.includes(t));
        if (miss.length === searchTokens.length) {
            conflictingKeywords.push(...miss);
            score -= Math.round(weights.conflictingIntentPenalty / 2);
            signals.push({ rule: 'search_keyword_miss', detail: 'No search-intent tokens found in company data', hits: miss, delta: -Math.round(weights.conflictingIntentPenalty / 2) });
        }
    }

    // Selected industry vs classification / corpus
    if (selectedIndustry) {
        const indNorm = normalize(selectedIndustry);
        const classInd = normalize([classification?.parentIndustry, classification?.subIndustry, classification?.primaryIndustry].filter(Boolean).join(' '));
        if (classInd.includes(indNorm) || corpus.includes(indNorm) || indNorm.split(' ').some((p) => p.length > 2 && (classInd.includes(p) || corpus.includes(p)))) {
            score += weights.selectedIndustryMatch;
            signals.push({ rule: 'selected_industry_match', detail: `Matches selected industry ${selectedIndustry}`, delta: weights.selectedIndustryMatch });
        } else {
            conflictingKeywords.push(selectedIndustry);
            score -= Math.round(weights.conflictingIntentPenalty / 3);
            signals.push({ rule: 'selected_industry_mismatch', detail: `Does not match selected industry ${selectedIndustry}`, delta: -Math.round(weights.conflictingIntentPenalty / 3) });
        }
    }

    // Target market industries (company-configurable)
    const parent = normalize(classification?.parentIndustry || '');
    const sub = normalize(classification?.subIndustry || '');
    const targetParentHits = cfg.targetParentIndustries.filter((x) => normalize(x) && (parent.includes(normalize(x)) || normalize(x).includes(parent)));
    const targetSubHits = cfg.targetSubIndustries.filter((x) => normalize(x) && (sub.includes(normalize(x)) || normalize(x).includes(sub) || corpus.includes(normalize(x))));
    if (targetParentHits.length || targetSubHits.length) {
        const add = weights.targetIndustryMatch + (targetSubHits.length ? 4 : 0);
        score += add;
        signals.push({ rule: 'target_industry_match', detail: `Target market industry fit: ${[...targetParentHits, ...targetSubHits].join(', ')}`, delta: add });
    } else if ((cfg.targetParentIndustries.length || cfg.targetSubIndustries.length) && classification?.parentIndustry) {
        score -= 8;
        signals.push({ rule: 'target_industry_miss', detail: 'Classified industry outside configured target market', delta: -8 });
    }

    if (classification?.parentIndustry && !amb.forceIrrelevant && classification?.status !== 'IRRELEVANT') {
        score += Math.round(weights.classificationIndustryMatch * Math.min(1, (Number(classification.confidenceScore) || 50) / 100));
        signals.push({ rule: 'classification_confidence', detail: `Uses Phase 6 classification ${classification.primaryIndustry || classification.parentIndustry}`, delta: Math.round(weights.classificationIndustryMatch * Math.min(1, (Number(classification.confidenceScore) || 50) / 100)) });
    }

    // Selected product + opportunity map products
    const productNeedles = uniq([
        selectedProduct,
        ...cfg.targetProducts,
        ...((opportunityMaps || []).flatMap((m) => (m.opportunityItems || []).map((i) => i.productName))),
        ...((opportunityMaps || []).flatMap((m) => (m.opportunityItems || []).flatMap((i) => i.positiveSignals || []))),
    ]);
    const productHits = containsAny(corpus, productNeedles);
    if (productHits.length) {
        matchingProducts.push(...productHits);
        const add = Math.min(weights.opportunityProductMatch + weights.selectedProductMatch, productHits.length * 8 + (selectedProduct ? weights.selectedProductMatch : 0));
        score += add;
        signals.push({ rule: 'product_match', detail: `Matching products/signals: ${productHits.join(', ')}`, hits: productHits, delta: add });
    }

    // Opportunity negative signals as conflicts
    const oppNeg = uniq((opportunityMaps || []).flatMap((m) => (m.opportunityItems || []).flatMap((i) => i.negativeSignals || [])));
    const oppNegHits = containsAny(corpus, oppNeg);
    if (oppNegHits.length) {
        conflictingKeywords.push(...oppNegHits);
        score -= oppNegHits.length * 6;
        signals.push({ rule: 'opportunity_negative_signal', detail: `Negative opportunity signals: ${oppNegHits.join(', ')}`, hits: oppNegHits, delta: -oppNegHits.length * 6 });
    }

    // Location fit
    const locationNeedles = uniq([selectedLocation, ...cfg.targetLocations]);
    const locHits = containsAny(corpus, locationNeedles);
    if (locHits.length) {
        score += weights.locationMatch;
        signals.push({ rule: 'location_match', detail: `Location fit: ${locHits.join(', ')}`, hits: locHits, delta: weights.locationMatch });
    }

    // Negative / exclusion keywords
    const negHits = containsAny(corpus, cfg.negativeKeywords);
    if (negHits.length) {
        conflictingKeywords.push(...negHits);
        const delta = negHits.length * weights.negativeKeywordPenalty;
        score -= delta;
        signals.push({ rule: 'negative_keyword', detail: `Negative keywords: ${negHits.join(', ')}`, hits: negHits, delta: -delta });
    }
    const exclHits = containsAny(corpus, cfg.exclusionKeywords);
    if (exclHits.length) {
        conflictingKeywords.push(...exclHits);
        const delta = exclHits.length * weights.exclusionKeywordPenalty;
        score -= delta;
        exclusionReason = exclusionReason || `Exclusion keywords matched: ${exclHits.join(', ')}`;
        signals.push({ rule: 'exclusion_keyword', detail: exclusionReason, hits: exclHits, delta: -delta });
    }

    // Multi-signal agreement boost
    const positiveRules = signals.filter((s) => (s.delta || 0) > 0).map((s) => s.rule);
    if (new Set(positiveRules).size >= 3) {
        score += weights.multiSignalAgreement;
        signals.push({ rule: 'multi_signal_agreement', detail: 'Multiple independent positive relevance signals', delta: weights.multiSignalAgreement });
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    let status = 'MANUAL_REVIEW';
    if (amb.forceIrrelevant || exclHits.length || classification?.status === 'IRRELEVANT') {
        status = 'IRRELEVANT';
        score = Math.min(score, 25);
    } else if (score >= cfg.relevantMinScore) {
        status = 'RELEVANT';
    } else if (score >= cfg.possiblyRelevantMinScore) {
        status = 'POSSIBLY_RELEVANT';
    } else if (score < 20) {
        status = 'IRRELEVANT';
        exclusionReason = exclusionReason || 'Low relevance score against search intent and target market';
    } else {
        status = 'MANUAL_REVIEW';
    }

    const explanationParts = signals
        .filter((s) => s.detail)
        .slice(0, 8)
        .map((s) => s.detail);

    return {
        status,
        relevanceScore: score,
        explanation: explanationParts.join(' | ') || 'Insufficient signals for relevance determination',
        matchingProducts: uniq(matchingProducts),
        conflictingKeywords: uniq(conflictingKeywords),
        exclusionReason: status === 'IRRELEVANT' ? (exclusionReason || 'Marked irrelevant by relevance engine') : '',
        signals,
        evidenceSnippets: uniq([
            ...(classification?.evidenceSnippets || []).slice(0, 5),
            ...searchHits.slice(0, 5).map((h) => `search:${h}`),
            ...productHits.slice(0, 5).map((h) => `product:${h}`),
        ]),
        searchKeyword,
        selectedIndustry,
        selectedProduct,
        selectedLocation,
        classificationStatus: classification?.status || '',
        primaryIndustry: classification?.primaryIndustry || '',
        parentIndustry: classification?.parentIndustry || '',
        subIndustry: classification?.subIndustry || '',
        companyName: record.companyName || classification?.companyName || '',
        engineVersion: ENGINE_VERSION,
        thresholds: {
            relevantMinScore: cfg.relevantMinScore,
            possiblyRelevantMinScore: cfg.possiblyRelevantMinScore,
        },
    };
}
