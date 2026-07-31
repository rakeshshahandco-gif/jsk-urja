import { DEFAULT_WEIGHTS, AMBIGUOUS_CONTEXT_RULES, ENGINE_VERSION } from './constants.js';
import { buildClassificationCorpus, keywordHits, phrasePresent, uniqStrings } from './corpus.js';

function getWeights(settings = {}) {
    const override = settings?.aiLeadIntelligence?.ruleWeights || {};
    return { ...DEFAULT_WEIGHTS, ...override };
}

function scoreOneIndustry(industry, { corpus, sourceUrls, sourceProviders }, weights) {
    const rulesMatched = [];
    let score = 0;

    const parentHits = keywordHits(corpus, [industry.parentIndustry, ...(industry.keywords || [])].filter(Boolean));
    const subHits = keywordHits(corpus, [industry.subIndustry].filter(Boolean));
    const productHits = keywordHits(corpus, industry.productKeywords || []);
    const websiteHits = keywordHits(corpus, industry.websiteKeywords || []);
    const negativeHits = keywordHits(corpus, industry.negativeKeywords || []);
    const exclusionHits = keywordHits(corpus, industry.exclusionTerms || industry.exclusions || []);

    // Exact / parent / sub
    if (parentHits.length) {
        const pts = parentHits.length * weights.parentIndustryKeyword;
        score += pts;
        rulesMatched.push({ rule: 'parent_industry_keyword', points: pts, detail: 'Matched: ' + parentHits.join(', ') });
    }
    if (subHits.length) {
        const pts = subHits.length * weights.subIndustryKeyword;
        score += pts;
        rulesMatched.push({ rule: 'sub_industry_keyword', points: pts, detail: 'Matched: ' + subHits.join(', ') });
    }
    if (parentHits.length && subHits.length) {
        const pts = weights.exactIndustryKeyword;
        score += pts;
        rulesMatched.push({ rule: 'exact_industry_keyword', points: pts, detail: 'Parent + sub industry signals present' });
    }
    if (productHits.length) {
        const pts = productHits.length * weights.productKeyword;
        score += pts;
        rulesMatched.push({ rule: 'product_keyword', points: pts, detail: 'Matched: ' + productHits.join(', ') });
    }
    if (websiteHits.length) {
        const pts = websiteHits.length * weights.websiteKeyword;
        score += pts;
        rulesMatched.push({ rule: 'website_keyword', points: pts, detail: 'Matched: ' + websiteHits.join(', ') });
    }

    // Directory / description soft signals from same keyword pools already counted;
    // multi-source agreement
    if (sourceProviders.length >= 2 && (parentHits.length || productHits.length)) {
        const pts = weights.multiSourceAgreement;
        score += pts;
        rulesMatched.push({ rule: 'multi_source_agreement', points: pts, detail: 'Sources: ' + sourceProviders.join(', ') });
    }

    if (negativeHits.length) {
        const pts = -(negativeHits.length * weights.negativeKeywordPenalty);
        score += pts;
        rulesMatched.push({ rule: 'negative_keyword_penalty', points: pts, detail: 'Matched: ' + negativeHits.join(', ') });
    }
    if (exclusionHits.length) {
        const pts = -(exclusionHits.length * weights.exclusionTermPenalty);
        score += pts;
        rulesMatched.push({ rule: 'exclusion_term_penalty', points: pts, detail: 'Matched: ' + exclusionHits.join(', ') });
    }

    return {
        industryId: industry._id ? String(industry._id) : null,
        parentIndustry: industry.parentIndustry || '',
        subIndustry: industry.subIndustry || '',
        primaryIndustry: [industry.parentIndustry, industry.subIndustry].filter(Boolean).join(' / '),
        score: Math.max(0, Math.round(score)),
        rulesMatched,
        positiveKeywordsFound: uniqStrings([...parentHits, ...subHits]),
        productSignals: productHits,
        websiteSignals: websiteHits,
        negativeKeywordsFound: uniqStrings([...negativeHits, ...exclusionHits]),
        evidenceSourceUrls: sourceUrls,
    };
}

function applyAmbiguousGuards(corpus, candidate) {
    const penalties = [];
    let forceIrrelevant = false;
    for (const rule of AMBIGUOUS_CONTEXT_RULES) {
        const hasToken = (rule.tokens || []).some((t) => phrasePresent(corpus, t));
        if (!hasToken) continue;
        const hasNeg = (rule.negativeContexts || []).some((t) => phrasePresent(corpus, t));
        if (!hasNeg) continue;
        const rescued = (rule.forceIrrelevantUnless || []).some((t) => phrasePresent(corpus, t));
        if (!rescued) {
            forceIrrelevant = true;
            penalties.push({
                rule: 'ambiguous_keyword_penalty',
                points: -20,
                detail: rule.detail,
                ambiguousRuleId: rule.id,
            });
        }
    }
    return { forceIrrelevant, penalties };
}

export function runRuleEngine(record, masters = {}, settings = {}) {
    const weights = getWeights(settings);
    const built = buildClassificationCorpus(record);
    const industries = (masters.industries || []).filter((x) => x.isActive !== false);
    const scored = industries.map((ind) => scoreOneIndustry(ind, built, weights)).sort((a, b) => b.score - a.score);

    const top = scored[0] || null;
    const second = scored[1] || null;
    const ambiguous = applyAmbiguousGuards(built.corpus, top);

    if (top) {
        for (const p of ambiguous.penalties) {
            top.score = Math.max(0, top.score + p.points);
            top.rulesMatched.push(p);
            top.negativeKeywordsFound = uniqStrings([...(top.negativeKeywordsFound || []), p.ambiguousRuleId || 'ambiguous']);
        }
    }

    // Customer type signals
    const customerTypes = (masters.customerTypes || []).filter((x) => x.isActive !== false);
    const ctScored = customerTypes.map((ct) => {
        const hits = keywordHits(built.corpus, ct.keywords || []);
        const neg = keywordHits(built.corpus, ct.negativeKeywords || []);
        let score = hits.length * weights.customerTypeSignal - neg.length * weights.negativeKeywordPenalty;
        return {
            customerTypeId: ct._id ? String(ct._id) : null,
            name: ct.name,
            score: Math.max(0, score),
            hits,
            negativeHits: neg,
        };
    }).sort((a, b) => b.score - a.score);

    const bestCt = ctScored[0] || null;
    if (top && bestCt?.hits?.length) {
        top.score += weights.customerTypeSignal;
        top.rulesMatched.push({
            rule: 'customer_type_signal',
            points: weights.customerTypeSignal,
            detail: 'Customer type: ' + bestCt.name + ' (' + bestCt.hits.join(', ') + ')',
        });
    }

    // Conflicting strong industries
    const conflict = top && second && top.score >= 40 && second.score >= 40 && (top.score - second.score) < 12;
    if (conflict && top) {
        top.score = Math.max(0, top.score - weights.conflictingIndustryPenalty);
        top.rulesMatched.push({
            rule: 'conflicting_industry_penalty',
            points: -weights.conflictingIndustryPenalty,
            detail: `Conflict with ${second.primaryIndustry} (score ${second.score})`,
        });
    }

    const secondary = scored.slice(1, 4).filter((x) => x.score >= Math.max(25, (top?.score || 0) * 0.55)).map((x) => ({
        industryId: x.industryId,
        parentIndustry: x.parentIndustry,
        subIndustry: x.subIndustry,
        primaryIndustry: x.primaryIndustry,
        confidenceScore: Math.min(100, x.score),
    }));

    return {
        version: ENGINE_VERSION,
        corpusMeta: { sourceUrls: built.sourceUrls, sourceProviders: built.sourceProviders },
        scoredIndustries: scored.slice(0, 8),
        top,
        second,
        conflict,
        forceIrrelevant: ambiguous.forceIrrelevant,
        customerType: bestCt,
        secondaryIndustries: secondary,
        evidenceSnippets: (top?.rulesMatched || []).slice(0, 8).map((r) => r.detail).filter(Boolean),
    };
}
