import { ENGINE_VERSION, DEFAULT_WEIGHTS, SALES_STRATEGIES } from './constants.js';

function uniq(list = []) {
    return [...new Set((list || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

function normalize(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9\s./:-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function hits(haystack, words = []) {
    const found = [];
    for (const w of uniq(words).map(normalize)) {
        if (w && haystack.includes(w)) found.push(w);
    }
    return found;
}

function buildCorpus(record = {}, classification = {}, relevance = {}) {
    return normalize([
        record.companyName,
        record.businessDescription,
        record.natureOfBusiness,
        record.websiteTitle,
        record.websiteMetaDescription,
        record.aboutPageText,
        record.productPageText,
        ...(record.productCategories || []),
        ...(record.keywords || []),
        ...(record.publicProductNames || []),
        record.brochureText,
        record.city,
        record.stateProvince || record.state,
        record.country,
        classification.primaryIndustry,
        classification.parentIndustry,
        classification.subIndustry,
        classification.customerType,
        ...(classification.positiveKeywordsFound || []),
        ...(classification.productSignals || []),
        ...(classification.websiteSignals || []),
        ...(classification.evidenceSnippets || []),
        relevance.explanation,
        ...(relevance.matchingProducts || []),
        ...(relevance.evidenceSnippets || []),
    ].filter(Boolean).join(' \n '));
}

function pickSalesStrategy(product, customerType, score) {
    const ct = normalize(customerType);
    if ((product.salesStrategies || []).length) {
        const preferred = product.salesStrategies.find((s) => normalize(s).includes(ct) || ct.includes(normalize(s).split(' ')[0]));
        if (preferred) return preferred;
        return product.salesStrategies[0];
    }
    if (ct.includes('oem')) return 'OEM Opportunity';
    if (ct.includes('distributor')) return 'Distributor Opportunity';
    if (ct.includes('dealer')) return 'Dealer';
    if (ct.includes('consultant') || ct.includes('architect')) return 'Consultant';
    if (ct.includes('system integrator') || ct.includes('integrator')) return 'System Integrator';
    if (ct.includes('exporter') || ct.includes('export')) return 'Export Opportunity';
    if (ct.includes('manufacturer')) return 'Manufacturer';
    if (ct.includes('service')) return 'Service Provider';
    if (score >= 80) return 'High Priority';
    if (score >= 55) return 'Medium Priority';
    if (score >= 35) return 'Low Priority';
    return 'Long-term Opportunity';
}

function scoreProduct(product, ctx) {
    const weights = ctx.weights;
    const corpus = ctx.corpus;
    const classification = ctx.classification || {};
    const relevance = ctx.relevance || {};
    const targetMarket = ctx.targetMarket || {};
    const opportunityMaps = ctx.opportunityMaps || [];
    const rules = [];
    let score = 0;
    const matchingKeywords = [];
    const matchingProducts = [];
    const conflictingSignals = [];
    const evidence = [];

    const parent = normalize(classification.parentIndustry || '');
    const sub = normalize(classification.subIndustry || '');
    const pParent = normalize(product.parentIndustry || '');
    const pSub = normalize(product.subIndustry || '');

    if (pParent && parent && (parent.includes(pParent) || pParent.includes(parent))) {
        score += weights.industryMatch;
        rules.push({ rule: 'industry_match', detail: `Industry match: ${product.parentIndustry}`, delta: weights.industryMatch });
    }
    if (pSub && sub && (sub.includes(pSub) || pSub.includes(sub))) {
        score += weights.subIndustryMatch;
        rules.push({ rule: 'sub_industry_match', detail: `Sub-industry match: ${product.subIndustry}`, delta: weights.subIndustryMatch });
    }

    const ct = normalize(classification.customerType || ctx.customerType || '');
    const ctHits = (product.applicableCustomerTypes || []).filter((t) => {
        const n = normalize(t);
        return n && ct && (ct.includes(n) || n.includes(ct));
    });
    if (ctHits.length) {
        score += weights.customerTypeMatch;
        rules.push({ rule: 'customer_type_match', detail: `Customer type: ${ctHits.join(', ')}`, delta: weights.customerTypeMatch });
    }

    const kwHits = hits(corpus, product.keywords);
    if (kwHits.length) {
        matchingKeywords.push(...kwHits);
        const add = Math.min(weights.productKeywordMatch * 1.5, kwHits.length * 6 + 4);
        score += add;
        rules.push({ rule: 'product_keywords', detail: `Keywords: ${kwHits.join(', ')}`, delta: add });
        evidence.push(...kwHits.map((k) => `keyword:${k}`));
    }

    const signalHits = hits(corpus, product.positiveSignals);
    if (signalHits.length) {
        matchingKeywords.push(...signalHits);
        score += Math.min(12, signalHits.length * 5);
        rules.push({ rule: 'positive_signals', detail: `Positive signals: ${signalHits.join(', ')}`, delta: Math.min(12, signalHits.length * 5) });
    }

    const appHits = hits(corpus, product.applications);
    if (appHits.length) {
        score += weights.applicationMatch;
        matchingKeywords.push(...appHits);
        rules.push({ rule: 'application_match', detail: `Applications: ${appHits.join(', ')}`, delta: weights.applicationMatch });
    }

    const companyProducts = uniq([
        ...(ctx.record?.publicProductNames || []),
        ...(ctx.record?.productCategories || []),
        ...(classification.productSignals || []),
        ...(relevance.matchingProducts || []),
    ]);
    const companyHits = companyProducts.filter((p) => {
        const n = normalize(p);
        return n && (normalize(product.productName).includes(n) || n.includes(normalize(product.productName)) || hits(n, product.keywords).length);
    });
    if (companyHits.length || hits(corpus, [product.productName]).length) {
        matchingProducts.push(product.productName, ...companyHits);
        score += weights.companyProductMatch;
        rules.push({ rule: 'company_product_match', detail: `Prospect products align with ${product.productName}`, delta: weights.companyProductMatch });
    }

    // Opportunity mapping boost
    for (const map of opportunityMaps) {
        const mapIndOk = !map.parentIndustry || normalize(map.parentIndustry) === parent || !parent;
        if (!mapIndOk) continue;
        for (const item of map.opportunityItems || []) {
            if (normalize(item.productName) === normalize(product.productName)
                || hits(normalize(item.productName), product.keywords).length
                || hits(corpus, item.positiveSignals || []).length) {
                score += weights.opportunityMapMatch;
                rules.push({ rule: 'opportunity_map', detail: `Opportunity map product: ${item.productName}`, delta: weights.opportunityMapMatch });
                if (item.salesStrategy) evidence.push(`strategy:${item.salesStrategy}`);
            }
            const neg = hits(corpus, item.negativeSignals || []);
            if (neg.length) {
                conflictingSignals.push(...neg);
                score -= neg.length * 5;
            }
        }
    }

    const targetProducts = targetMarket.targetProducts || [];
    if (hits(normalize(product.productName + ' ' + (product.keywords || []).join(' ')), targetProducts).length
        || hits(corpus, targetProducts).length && hits(normalize(product.productName), targetProducts).length) {
        score += weights.targetMarketBoost;
        rules.push({ rule: 'target_market', detail: 'Matches configured target market products', delta: weights.targetMarketBoost });
    }

    const loc = normalize([ctx.record?.city, ctx.record?.state, ctx.record?.country, ctx.searchContext?.selectedLocation].filter(Boolean).join(' '));
    const locHits = hits(loc, targetMarket.targetLocations || []);
    if (locHits.length) {
        score += weights.locationBoost;
        rules.push({ rule: 'location', detail: `Location: ${locHits.join(', ')}`, delta: weights.locationBoost });
    }

    const classConf = Number(classification.confidenceScore || ctx.classificationConfidence || 0);
    if (classConf >= 60) {
        const add = Math.round(weights.classificationConfidenceBoost * (classConf / 100));
        score += add;
        rules.push({ rule: 'classification_confidence', detail: `Classification confidence ${classConf}`, delta: add });
    }
    const relScore = Number(relevance.relevanceScore || ctx.relevanceScore || 0);
    if (relScore >= 45) {
        const add = Math.round(weights.relevanceScoreBoost * (relScore / 100));
        score += add;
        rules.push({ rule: 'relevance_score', detail: `Relevance score ${relScore}`, delta: add });
    }

    const negHits = hits(corpus, product.negativeKeywords);
    if (negHits.length) {
        conflictingSignals.push(...negHits);
        const delta = negHits.length * weights.negativeKeywordPenalty;
        score -= delta;
        rules.push({ rule: 'negative_keywords', detail: `Negative: ${negHits.join(', ')}`, delta: -delta });
    }

    const excl = hits(corpus, targetMarket.exclusionKeywords || []);
    if (excl.length) {
        conflictingSignals.push(...excl);
        score -= weights.exclusionPenalty;
        rules.push({ rule: 'exclusion_terms', detail: `Exclusion: ${excl.join(', ')}`, delta: -weights.exclusionPenalty });
    }

    const positiveRuleCount = rules.filter((r) => (r.delta || 0) > 0).length;
    if (positiveRuleCount >= 3) {
        score += weights.multiSourceAgreement;
        rules.push({ rule: 'multi_source_agreement', detail: 'Multiple independent matching signals', delta: weights.multiSourceAgreement });
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const salesStrategy = pickSalesStrategy(product, classification.customerType || ctx.customerType, score);
    const priority = score >= 80 ? 'High Priority' : score >= 55 ? (product.priority === 'high' ? 'High Priority' : 'Medium Priority') : score >= 35 ? 'Low Priority' : 'Long-term Opportunity';

    return {
        productId: product._id || null,
        productName: product.productName,
        productCategory: product.productCategory || '',
        priority,
        opportunityScore: score,
        confidence: score,
        reason: rules.filter((r) => (r.delta || 0) > 0).slice(0, 5).map((r) => r.detail).join(' | ') || 'Limited positive product signals',
        salesStrategy,
        brochureUrl: product.brochureUrl || '',
        catalogUrl: product.catalogUrl || '',
        datasheetUrl: product.datasheetUrl || '',
        matchingKeywords: uniq(matchingKeywords),
        matchingProducts: uniq(matchingProducts),
        conflictingSignals: uniq(conflictingSignals),
        evidence: uniq(evidence).slice(0, 12),
        rulesMatched: rules,
        followUpAction: product.salesNotes || `Share ${product.productName} brochure and schedule discovery call`,
        upsellOf: product.upsellOf || [],
        crossSellWith: product.crossSellWith || [],
        bundleWith: product.bundleWith || [],
        _score: score,
    };
}

/**
 * Explainable product opportunity recommendation engine.
 * Uses only company-scoped Product Master + Opportunity Mapping — no hardcoded catalog.
 */
export function recommendProducts({
    record = {},
    classification = null,
    relevance = null,
    products = [],
    opportunityMaps = [],
    settingsDoc = null,
    searchContext = {},
    customerType = '',
} = {}) {
    const raw = settingsDoc?.aiLeadIntelligence || {};
    const rec = raw.productRecommendation || {};
    const weights = { ...DEFAULT_WEIGHTS, ...(rec.weights || {}) };
    const minScore = Number(rec.minimumOpportunityScore) || 35;
    const primaryMin = Number(rec.primaryMinScore) || 55;

    const activeProducts = (products || []).filter((p) => p && p.isActive !== false);
    const corpus = buildCorpus(record, classification || {}, relevance || {});
    const ctx = {
        corpus,
        record,
        classification,
        relevance,
        opportunityMaps,
        targetMarket: raw.targetMarket || {},
        searchContext,
        customerType: customerType || classification?.customerType || '',
        classificationConfidence: classification?.confidenceScore,
        relevanceScore: relevance?.relevanceScore,
        weights,
    };

    const scored = activeProducts
        .map((p) => scoreProduct(p, ctx))
        .filter((x) => x._score >= minScore && !(x.conflictingSignals.length && x._score < primaryMin))
        .sort((a, b) => b._score - a._score);

    const primary = scored[0] || null;
    const secondary = scored.slice(1, 4).map((x) => ({ ...x, role: 'secondary' }));
    const alternatives = scored.slice(4, 7).map((x) => ({ ...x, role: 'alternative' }));

    const byName = Object.fromEntries(activeProducts.map((p) => [normalize(p.productName), p]));
    const crossSell = [];
    const upsell = [];
    const bundle = [];
    if (primary) {
        for (const name of primary.crossSellWith || []) {
            const p = byName[normalize(name)];
            if (!p) continue;
            const s = scoreProduct(p, ctx);
            crossSell.push({ ...s, role: 'cross_sell', reason: `Cross-sell with ${primary.productName}: ${s.reason}` });
        }
        for (const name of primary.upsellOf || []) {
            const p = byName[normalize(name)];
            if (!p) continue;
            const s = scoreProduct(p, ctx);
            upsell.push({ ...s, role: 'upsell', reason: `Upsell path via ${primary.productName}: ${s.reason}` });
        }
        for (const name of primary.bundleWith || []) {
            const p = byName[normalize(name)];
            if (!p) continue;
            const s = scoreProduct(p, ctx);
            bundle.push({ ...s, role: 'bundle', reason: `Bundle with ${primary.productName}` });
        }
    }

    let status = 'MANUAL_REVIEW';
    if (!primary) status = 'LOW_CONFIDENCE';
    else if (primary._score >= primaryMin) status = 'RECOMMENDED';
    else status = 'LOW_CONFIDENCE';

    const opportunityScore = primary?._score || 0;
    const strip = (item, role) => {
        if (!item) return null;
        const { _score, upsellOf, crossSellWith, bundleWith, ...rest } = item;
        return { ...rest, role: role || rest.role || 'primary' };
    };

    return {
        status,
        companyName: record.companyName || classification?.companyName || '',
        parentIndustry: classification?.parentIndustry || '',
        subIndustry: classification?.subIndustry || '',
        customerType: customerType || classification?.customerType || '',
        searchKeyword: searchContext.searchKeyword || relevance?.searchKeyword || '',
        relevanceScore: Number(relevance?.relevanceScore || 0),
        classificationConfidence: Number(classification?.confidenceScore || 0),
        opportunityScore,
        confidence: opportunityScore,
        primaryRecommendation: strip(primary, 'primary'),
        secondaryRecommendations: secondary.map((x) => strip(x, 'secondary')),
        alternativeProducts: alternatives.map((x) => strip(x, 'alternative')),
        crossSellOpportunities: crossSell.slice(0, 3).map((x) => strip(x, 'cross_sell')),
        upsellOpportunities: upsell.slice(0, 3).map((x) => strip(x, 'upsell')),
        bundleRecommendations: bundle.slice(0, 3).map((x) => strip(x, 'bundle')),
        recommendedSalesStrategy: primary?.salesStrategy || SALES_STRATEGIES[2],
        recommendedFollowUpAction: primary?.followUpAction || '',
        engineUsed: 'rule_based',
        modelProvider: '',
        modelVersion: ENGINE_VERSION,
        fallbackUsed: false,
        analysisTimestamp: new Date().toISOString(),
        version: ENGINE_VERSION,
    };
}

export { SALES_STRATEGIES, ENGINE_VERSION };
