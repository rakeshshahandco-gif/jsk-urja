import { AiIndustryMaster } from '../../models/aiIndustryMaster.model.js';
import { AiCustomerTypeMaster } from '../../models/aiCustomerTypeMaster.model.js';
import { AiOpportunityMap } from '../../models/aiOpportunityMap.model.js';

const ENGINE_VERSION = 'ai-lead-intelligence-v1';
const OPENAI_MODEL = () => String(process.env.EXTRACTOR_OPENAI_MODEL || 'gpt-4o-mini').trim();

function uniqStrings(list = []) {
    return [...new Set((list || []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean))];
}

function normalizeText(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9\s./:-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(text) {
    return normalizeText(text).split(/\s+/).filter(Boolean);
}

function buildCorpus(record = {}) {
    return [
        record.companyName,
        record.website,
        record.sourceUrl,
        record.businessDescription,
        record.natureOfBusiness,
        ...(record.productCategories || []),
        ...(record.keywords || []),
        ...(record.rawExtractedData?.sourceUrls || []),
        ...(record.rawExtractedData?.discoveredDomains || []).map((x) => x.normalized || x.value),
        ...(record.rawExtractedData?.discoveredWebsites || []).map((x) => x.normalized || x.value),
    ].filter(Boolean).join(' \n ');
}

function keywordHits(haystack, keywords = []) {
    const hits = [];
    for (const word of uniqStrings(keywords)) {
        if (!word) continue;
        if (haystack.includes(word)) hits.push(word);
    }
    return hits;
}

function safeSourceUrls(record = {}) {
    return uniqStrings([
        record.sourceUrl,
        ...(record.rawExtractedData?.sourceUrls || []),
        ...(record.rawExtractedData?.discoveredWebsites || []).map((x) => x.normalized || x.value),
    ]);
}

function defaultAiSettings(settings = {}) {
    const raw = settings?.aiLeadIntelligence || {};
    const tm = raw.targetMarket && typeof raw.targetMarket === 'object' ? raw.targetMarket : {};
    return {
        enabled: raw.enabled === true,
        classificationMode: ['manual_review', 'rule_based', 'hybrid', 'ai'].includes(raw.classificationMode) ? raw.classificationMode : 'rule_based',
        minimumConfidence: Number(raw.minimumConfidence) || 45,
        autoApplyOnSearch: raw.autoApplyOnSearch !== false,
        requireManualReviewBelowConfidence: Number(raw.requireManualReviewBelowConfidence) || 60,
        targetMarket: {
            relevantMinScore: Number(tm.relevantMinScore) || 70,
            possiblyRelevantMinScore: Number(tm.possiblyRelevantMinScore) || 45,
            targetParentIndustries: [...new Set((tm.targetParentIndustries || []).map((x) => String(x || '').trim()).filter(Boolean))],
            targetSubIndustries: [...new Set((tm.targetSubIndustries || []).map((x) => String(x || '').trim()).filter(Boolean))],
            targetProducts: [...new Set((tm.targetProducts || []).map((x) => String(x || '').trim()).filter(Boolean))],
            targetLocations: [...new Set((tm.targetLocations || []).map((x) => String(x || '').trim()).filter(Boolean))],
            exclusionKeywords: [...new Set((tm.exclusionKeywords || []).map((x) => String(x || '').trim()).filter(Boolean))],
            negativeKeywords: [...new Set((tm.negativeKeywords || []).map((x) => String(x || '').trim()).filter(Boolean))],
        },
        productRecommendation: {
            mode: ['manual_review', 'rule_based', 'hybrid', 'ai'].includes((raw.productRecommendation || {}).mode)
                ? raw.productRecommendation.mode
                : 'rule_based',
            minimumOpportunityScore: Number((raw.productRecommendation || {}).minimumOpportunityScore) || 35,
            primaryMinScore: Number((raw.productRecommendation || {}).primaryMinScore) || 55,
        },
    };
}

function scoreIndustry(industry, haystack, record = {}) {
    const generalHits = keywordHits(haystack, industry.keywords);
    const negativeHits = keywordHits(haystack, industry.negativeKeywords);
    const productHits = keywordHits(haystack, industry.productKeywords);
    const websiteHits = keywordHits(haystack, [
        ...(industry.websiteKeywords || []),
        ...safeSourceUrls(record),
    ]);

    let score = generalHits.length * 18 + productHits.length * 20 + websiteHits.length * 12;
    score -= negativeHits.length * 15;

    return {
        industryId: industry._id ? String(industry._id) : undefined,
        parentIndustry: industry.parentIndustry,
        subIndustry: industry.subIndustry,
        score: Math.max(0, score),
        generalHits,
        negativeHits,
        productHits,
        websiteHits,
    };
}

function scoreCustomerType(customerType, haystack) {
    const hits = keywordHits(haystack, customerType.keywords);
    const negativeHits = keywordHits(haystack, customerType.negativeKeywords);
    const score = Math.max(0, hits.length * 20 - negativeHits.length * 15);
    return {
        customerTypeId: customerType._id ? String(customerType._id) : undefined,
        name: customerType.name,
        score,
        hits,
        negativeHits,
    };
}

function deriveOpportunities(opportunityMaps = [], industryResult, customerTypeResult, haystack) {
    const matched = [];
    for (const map of opportunityMaps || []) {
        const sameIndustry = String(map.parentIndustry || '').toLowerCase() === String(industryResult?.parentIndustry || '').toLowerCase()
            && (!map.subIndustry || String(map.subIndustry).toLowerCase() === String(industryResult?.subIndustry || '').toLowerCase());
        const sameCustomerType = !map.customerType
            || String(map.customerType).toLowerCase() === String(customerTypeResult?.name || '').toLowerCase();
        if (!sameIndustry || !sameCustomerType) continue;
        for (const item of map.opportunityItems || []) {
            const positiveHits = keywordHits(haystack, item.positiveSignals);
            const negativeHits = keywordHits(haystack, item.negativeSignals);
            matched.push({
                productName: item.productName,
                priority: item.priority || 'medium',
                salesStrategy: item.salesStrategy || '',
                positiveSignals: item.positiveSignals || [],
                negativeSignals: item.negativeSignals || [],
                recommendedFollowUp: item.recommendedFollowUp || '',
                recommendedSalesperson: item.recommendedSalesperson || '',
                matchedPositiveSignals: positiveHits,
                matchedNegativeSignals: negativeHits,
            });
        }
    }
    return matched;
}

function buildRuleExplainability(record, engineMode, industryResult, customerTypeResult, opportunities) {
    const evidence = [];
    if (industryResult?.generalHits?.length) evidence.push(`Industry keywords: ${industryResult.generalHits.join(', ')}`);
    if (industryResult?.productHits?.length) evidence.push(`Product keywords: ${industryResult.productHits.join(', ')}`);
    if (industryResult?.websiteHits?.length) evidence.push(`Website keywords: ${industryResult.websiteHits.join(', ')}`);
    if (customerTypeResult?.hits?.length) evidence.push(`Customer type keywords: ${customerTypeResult.hits.join(', ')}`);
    if (opportunities?.some((x) => x.matchedPositiveSignals?.length)) {
        const flattened = opportunities.flatMap((x) => x.matchedPositiveSignals).filter(Boolean);
        if (flattened.length) evidence.push(`Positive opportunity signals: ${uniqStrings(flattened).join(', ')}`);
    }

    return {
        confidence: Math.min(100, Math.max(industryResult?.score || 0, customerTypeResult?.score || 0)),
        evidence,
        keywordsFound: uniqStrings([
            ...(industryResult?.generalHits || []),
            ...(industryResult?.productHits || []),
            ...(industryResult?.websiteHits || []),
            ...(customerTypeResult?.hits || []),
        ]),
        sourceUrls: safeSourceUrls(record),
        engineUsed: engineMode,
        modelVersion: engineMode.startsWith('ai') ? OPENAI_MODEL() : ENGINE_VERSION,
    };
}

async function callOpenAiJson(prompt) {
    const apiKey = String(process.env.EXTRACTOR_OPENAI_API_KEY || '').trim();
    if (!apiKey) throw new Error('EXTRACTOR_OPENAI_API_KEY is not set');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: OPENAI_MODEL(),
            temperature: 0.1,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: 'You classify B2B lead records using provided industry and customer-type master data. Return strict JSON only.' },
                { role: 'user', content: prompt },
            ],
        }),
        signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 180)}`);
    }

    const data = await res.json();
    return JSON.parse(data?.choices?.[0]?.message?.content || '{}');
}

async function runAiClassification(record, ruleResult, masters) {
    const prompt = `Classify this B2B lead record.
Company: ${record.companyName || ''}
Website: ${record.website || record.sourceUrl || ''}
Description: ${record.businessDescription || ''}
Keywords: ${(record.keywords || []).join(', ')}
Product categories: ${(record.productCategories || []).join(', ')}

Available industries:
${(masters.industries || []).map((x) => `- ${x.parentIndustry} > ${x.subIndustry}; keywords=${(x.keywords || []).join('|')}; products=${(x.productKeywords || []).join('|')}`).join('\n')}

Available customer types:
${(masters.customerTypes || []).map((x) => `- ${x.name}; keywords=${(x.keywords || []).join('|')}`).join('\n')}

Rule suggestion:
${JSON.stringify({
    parentIndustry: ruleResult?.industry?.parentIndustry || '',
    subIndustry: ruleResult?.industry?.subIndustry || '',
    customerType: ruleResult?.customerType?.name || '',
}, null, 2)}

Return JSON:
{
  "parentIndustry": "string",
  "subIndustry": "string",
  "customerType": "string",
  "confidence": 0,
  "evidence": ["..."],
  "keywordsFound": ["..."]
}`;
    return callOpenAiJson(prompt);
}

export async function loadLeadIntelligenceMasters(companyId) {
    const [industries, customerTypes, opportunityMaps] = await Promise.all([
        AiIndustryMaster.find({ companyId, isActive: true }).sort({ parentIndustry: 1, subIndustry: 1 }).lean(),
        AiCustomerTypeMaster.find({ companyId, isActive: true }).sort({ name: 1 }).lean(),
        AiOpportunityMap.find({ companyId, isActive: true }).sort({ parentIndustry: 1, subIndustry: 1 }).lean(),
    ]);
    return { industries, customerTypes, opportunityMaps };
}

export async function classifyLeadRecord(record, settings, masters, options = {}) {
    const aiSettings = defaultAiSettings(settings);
    const haystack = buildCorpus(record);
    const industryCandidates = (masters.industries || []).map((x) => scoreIndustry(x, haystack, record)).sort((a, b) => b.score - a.score);
    const customerTypeCandidates = (masters.customerTypes || []).map((x) => scoreCustomerType(x, haystack)).sort((a, b) => b.score - a.score);
    const bestIndustry = industryCandidates[0] || null;
    const bestCustomerType = customerTypeCandidates[0] || null;
    const ruleOpportunities = deriveOpportunities(masters.opportunityMaps, bestIndustry, bestCustomerType, haystack);
    const ruleExplainability = buildRuleExplainability(record, 'rule_based', bestIndustry, bestCustomerType, ruleOpportunities);

    let finalIndustry = bestIndustry;
    let finalCustomerType = bestCustomerType;
    let engineUsed = 'rule_based';
    let aiError = '';
    let explainability = ruleExplainability;

    const aiAllowed = aiSettings.enabled && ['hybrid', 'ai'].includes(aiSettings.classificationMode) && String(process.env.EXTRACTOR_OPENAI_API_KEY || '').trim();
    if (aiAllowed) {
        try {
            const ai = await runAiClassification(record, { industry: bestIndustry, customerType: bestCustomerType }, masters);
            engineUsed = aiSettings.classificationMode === 'ai' ? 'ai' : 'ai+rule_hybrid';
            finalIndustry = {
                ...bestIndustry,
                parentIndustry: ai.parentIndustry || bestIndustry?.parentIndustry || '',
                subIndustry: ai.subIndustry || bestIndustry?.subIndustry || '',
                score: Math.max(bestIndustry?.score || 0, Number(ai.confidence) || 0),
            };
            finalCustomerType = {
                ...bestCustomerType,
                name: ai.customerType || bestCustomerType?.name || '',
                score: Math.max(bestCustomerType?.score || 0, Number(ai.confidence) || 0),
            };
            explainability = {
                confidence: Number(ai.confidence) || ruleExplainability.confidence,
                evidence: Array.isArray(ai.evidence) && ai.evidence.length ? ai.evidence : ruleExplainability.evidence,
                keywordsFound: Array.isArray(ai.keywordsFound) && ai.keywordsFound.length ? ai.keywordsFound.map((x) => String(x).toLowerCase()) : ruleExplainability.keywordsFound,
                sourceUrls: ruleExplainability.sourceUrls,
                engineUsed,
                modelVersion: OPENAI_MODEL(),
            };
        } catch (err) {
            aiError = err?.message || 'AI classification failed';
            engineUsed = aiSettings.classificationMode === 'ai' ? 'ai_fallback_rule' : 'rule_based_fallback';
            explainability = { ...ruleExplainability, engineUsed, modelVersion: ENGINE_VERSION };
        }
    }

    if (aiSettings.classificationMode === 'manual_review') {
        engineUsed = 'manual_review';
        explainability = { ...ruleExplainability, engineUsed, modelVersion: ENGINE_VERSION };
    }

    const opportunities = deriveOpportunities(masters.opportunityMaps, finalIndustry, finalCustomerType, haystack);
    const requiresManualReview = aiSettings.classificationMode === 'manual_review'
        || explainability.confidence < aiSettings.requireManualReviewBelowConfidence;

    return {
        industry: finalIndustry ? {
            id: finalIndustry.industryId,
            parentIndustry: finalIndustry.parentIndustry,
            subIndustry: finalIndustry.subIndustry,
        } : null,
        customerType: finalCustomerType ? {
            id: finalCustomerType.customerTypeId,
            name: finalCustomerType.name,
        } : null,
        opportunities,
        explainability,
        engineUsed,
        aiError,
        requiresManualReview,
        status: requiresManualReview ? 'manual_review' : 'classified',
        candidates: {
            industries: industryCandidates.slice(0, 5),
            customerTypes: customerTypeCandidates.slice(0, 5),
        },
        appliedAt: new Date().toISOString(),
        version: ENGINE_VERSION,
        searchKeyword: options.searchKeyword || '',
    };
}

export async function applyLeadIntelligenceToRecord(record, settings, { companyId = null, masters = null, searchKeyword = '' } = {}) {
    const aiSettings = defaultAiSettings(settings);
    if (!aiSettings.enabled && !settings?.aiEnabled) return record;

    const resolvedMasters = masters || (companyId ? await loadLeadIntelligenceMasters(companyId) : { industries: [], customerTypes: [], opportunityMaps: [] });
    const result = await classifyLeadRecord(record, settings, resolvedMasters, { searchKeyword });

    return {
        ...record,
        aiClassification: [
            result.industry?.subIndustry || result.industry?.parentIndustry || '',
            result.customerType?.name || '',
        ].filter(Boolean).join(' · '),
        aiSummary: [
            result.industry?.parentIndustry ? `${result.industry.parentIndustry}${result.industry?.subIndustry ? ` / ${result.industry.subIndustry}` : ''}` : '',
            result.customerType?.name ? `Type: ${result.customerType.name}` : '',
            result.opportunities?.[0]?.productName ? `Top product: ${result.opportunities[0].productName}` : '',
        ].filter(Boolean).join(' | ').slice(0, 500),
        rawExtractedData: {
            ...(record.rawExtractedData || {}),
            aiLeadIntelligence: result,
        },
    };
}

export async function applyLeadIntelligenceToRecords(records, settings, options = {}) {
    const out = [];
    for (const record of records || []) {
        // eslint-disable-next-line no-await-in-loop
        out.push(await applyLeadIntelligenceToRecord(record, settings, options));
    }
    return out;
}

export { defaultAiSettings, ENGINE_VERSION as AI_LEAD_INTELLIGENCE_VERSION };
