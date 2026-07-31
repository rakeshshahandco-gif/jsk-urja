import { ENGINE_VERSION } from './constants.js';
import { runRuleEngine } from './ruleEngine.service.js';
import { classifyWithAiProvider, getConfiguredAiProvider } from './aiProvider.adapter.js';
import { validateAiClassificationOutput } from './validateAiOutput.js';
import { defaultAiSettings, loadLeadIntelligenceMasters } from '../aiLeadIntelligence.service.js';

function decideStatusFromRules(ruleResult, aiSettings) {
    if (ruleResult.forceIrrelevant) {
        return { status: 'IRRELEVANT', reason: 'Ambiguous/exclusion context indicates irrelevant match' };
    }
    const top = ruleResult.top;
    if (!top || top.score <= 0) {
        return { status: 'IRRELEVANT', reason: 'No positive industry signals' };
    }
    if (ruleResult.conflict) {
        return { status: 'MULTIPLE_POSSIBILITIES', reason: 'Conflicting strong industry signals' };
    }
    if (top.score < (aiSettings.minimumConfidence || 45)) {
        return { status: 'LOW_CONFIDENCE', reason: 'Below minimumConfidence' };
    }
    if (top.score < (aiSettings.requireManualReviewBelowConfidence || 60)) {
        return { status: 'MANUAL_REVIEW_REQUIRED', reason: 'Below requireManualReviewBelowConfidence' };
    }
    return { status: 'CLASSIFIED', reason: '' };
}

function mapIndustryFromId(masters, id) {
    return (masters.industries || []).find((x) => String(x._id) === String(id)) || null;
}

function mapCustomerTypeFromId(masters, id) {
    return (masters.customerTypes || []).find((x) => String(x._id) === String(id)) || null;
}

function buildResultEnvelope({
    record,
    ruleResult,
    status,
    engineUsed,
    modelProvider = '',
    modelVersion = ENGINE_VERSION,
    fallbackUsed = false,
    manualReviewReason = '',
    aiSettings,
    masters,
    overrideIndustry = null,
    overrideCustomerType = null,
    overrideSecondary = null,
    confidenceOverride = null,
    evidenceOverride = null,
    keywordsOverride = null,
}) {
    const top = overrideIndustry || ruleResult.top;
    const ct = overrideCustomerType || ruleResult.customerType;
    const confidence = confidenceOverride != null ? confidenceOverride : Math.min(100, top?.score || 0);
    const applied = aiSettings.classificationMode !== 'manual_review'
        && status === 'CLASSIFIED'
        && aiSettings.autoApplyOnSearch !== false;

    const isIrrelevant = status === 'IRRELEVANT';
    return {
        companyName: record.companyName || '',
        status,
        primaryIndustry: isIrrelevant ? '' : (top ? [top.parentIndustry, top.subIndustry].filter(Boolean).join(' / ') : ''),
        primaryIndustryId: isIrrelevant ? null : (top?.industryId || null),
        parentIndustry: isIrrelevant ? '' : (top?.parentIndustry || ''),
        subIndustry: isIrrelevant ? '' : (top?.subIndustry || ''),
        secondaryIndustries: isIrrelevant ? [] : (overrideSecondary || ruleResult.secondaryIndustries || []),
        customerType: ct?.name || '',
        customerTypeId: ct?.customerTypeId || ct?._id || null,
        confidenceScore: confidence,
        engineUsed,
        modelProvider,
        modelVersion,
        rulesMatched: top?.rulesMatched || [],
        positiveKeywordsFound: keywordsOverride?.positive || top?.positiveKeywordsFound || [],
        negativeKeywordsFound: keywordsOverride?.negative || top?.negativeKeywordsFound || [],
        productSignals: top?.productSignals || [],
        websiteSignals: top?.websiteSignals || [],
        evidenceSnippets: evidenceOverride || ruleResult.evidenceSnippets || [],
        evidenceSourceUrls: ruleResult.corpusMeta?.sourceUrls || [],
        analysisTimestamp: new Date().toISOString(),
        manualReviewReason,
        fallbackUsed,
        applied,
        candidates: {
            industries: (ruleResult.scoredIndustries || []).slice(0, 5),
            customerTypes: ruleResult.customerType ? [ruleResult.customerType] : [],
        },
        version: ENGINE_VERSION,
    };
}

export async function classifyIndustryRecord(companyId, record, settingsDoc = null, options = {}) {
    if (options.bodyCompanyId != null || options.queryCompanyId != null) {
        throw new Error('companyId overrides are rejected');
    }

    const settings = settingsDoc || {};
    const aiSettings = defaultAiSettings(settings);
    const masters = options.masters || await loadLeadIntelligenceMasters(companyId);
    const ruleResult = runRuleEngine(record, masters, settings);
    const mode = options.forceMode || aiSettings.classificationMode || 'rule_based';

    // MANUAL_REVIEW: suggestions only, never auto-apply
    if (mode === 'manual_review') {
        const decided = decideStatusFromRules(ruleResult, aiSettings);
        const envelope = buildResultEnvelope({
            record,
            ruleResult,
            status: 'MANUAL_REVIEW_REQUIRED',
            engineUsed: 'manual_review',
            manualReviewReason: decided.reason || 'Manual review mode enabled',
            aiSettings: { ...aiSettings, classificationMode: 'manual_review', autoApplyOnSearch: false },
            masters,
        });
        envelope.applied = false;
        return envelope;
    }

    // RULE_BASED
    if (mode === 'rule_based') {
        const decided = decideStatusFromRules(ruleResult, aiSettings);
        return buildResultEnvelope({
            record,
            ruleResult,
            status: decided.status,
            engineUsed: 'rule_based',
            manualReviewReason: decided.reason,
            aiSettings,
            masters,
        });
    }

    // AI or HYBRID
    let fallbackUsed = false;
    let engineUsed = mode === 'hybrid' ? 'hybrid' : 'ai';
    let modelProvider = '';
    let modelVersion = ENGINE_VERSION;
    let status;
    let manualReviewReason = '';
    let overrideIndustry = null;
    let overrideCustomerType = null;
    let overrideSecondary = null;
    let confidenceOverride = null;
    let evidenceOverride = null;
    let keywordsOverride = null;

    const provider = getConfiguredAiProvider(settings);
    if (!provider.configured) {
        fallbackUsed = true;
        engineUsed = mode === 'ai' ? 'ai_fallback_rule' : 'hybrid_fallback_rule';
        const decided = decideStatusFromRules(ruleResult, aiSettings);
        status = decided.status;
        manualReviewReason = decided.reason || 'AI unavailable; rule fallback used';
    } else {
        try {
            // Hybrid: rules first, then AI validation/enrichment
            const ruleSuggestion = {
                primaryIndustryId: ruleResult.top?.industryId || '',
                parentIndustry: ruleResult.top?.parentIndustry || '',
                subIndustry: ruleResult.top?.subIndustry || '',
                customerTypeId: ruleResult.customerType?.customerTypeId || '',
                confidence: ruleResult.top?.score || 0,
                status: decideStatusFromRules(ruleResult, aiSettings).status,
            };
            const aiResult = await classifyWithAiProvider({
                record,
                masters,
                ruleSuggestion,
                settings,
            });
            modelProvider = aiResult.provider;
            modelVersion = aiResult.model || ENGINE_VERSION;
            const validated = validateAiClassificationOutput(aiResult, masters, companyId);
            if (!validated.ok) {
                fallbackUsed = true;
                engineUsed = mode === 'ai' ? 'ai_fallback_rule' : 'hybrid_fallback_rule';
                const decided = decideStatusFromRules(ruleResult, aiSettings);
                status = decided.status;
                manualReviewReason = 'Malformed/unsupported AI output rejected: ' + validated.errors.join('; ');
            } else {
                const n = validated.normalized;
                const ind = mapIndustryFromId(masters, n.primaryIndustryId);
                overrideIndustry = ind ? {
                    industryId: String(ind._id),
                    parentIndustry: ind.parentIndustry,
                    subIndustry: ind.subIndustry,
                    score: n.confidence,
                    rulesMatched: [
                        ...(ruleResult.top?.rulesMatched || []),
                        { rule: 'ai_validation', points: 0, detail: 'AI validated against Industry Master' },
                    ],
                    positiveKeywordsFound: n.keywordsFound,
                    negativeKeywordsFound: ruleResult.top?.negativeKeywordsFound || [],
                    productSignals: ruleResult.top?.productSignals || [],
                    websiteSignals: ruleResult.top?.websiteSignals || [],
                } : ruleResult.top;
                const ct = mapCustomerTypeFromId(masters, n.customerTypeId);
                overrideCustomerType = ct ? {
                    customerTypeId: String(ct._id),
                    name: ct.name,
                    score: n.confidence,
                } : ruleResult.customerType;
                overrideSecondary = (n.secondaryIndustryIds || []).map((id) => {
                    const s = mapIndustryFromId(masters, id);
                    return s ? {
                        industryId: String(s._id),
                        parentIndustry: s.parentIndustry,
                        subIndustry: s.subIndustry,
                        primaryIndustry: [s.parentIndustry, s.subIndustry].filter(Boolean).join(' / '),
                        confidenceScore: n.confidence,
                    } : null;
                }).filter(Boolean);
                confidenceOverride = n.confidence;
                evidenceOverride = n.evidence;
                keywordsOverride = { positive: n.keywordsFound, negative: ruleResult.top?.negativeKeywordsFound || [] };
                status = n.status || decideStatusFromRules(ruleResult, aiSettings).status;
                if (ruleResult.forceIrrelevant) status = 'IRRELEVANT';
                manualReviewReason = n.manualReviewReason || '';
                if (status === 'CLASSIFIED' && n.confidence < (aiSettings.requireManualReviewBelowConfidence || 60)) {
                    status = 'MANUAL_REVIEW_REQUIRED';
                    manualReviewReason = manualReviewReason || 'AI confidence below review threshold';
                }
                engineUsed = mode === 'hybrid' ? 'ai+rule_hybrid' : 'ai';
            }
        } catch (err) {
            fallbackUsed = true;
            engineUsed = mode === 'ai' ? 'ai_fallback_rule' : 'hybrid_fallback_rule';
            const decided = decideStatusFromRules(ruleResult, aiSettings);
            status = decided.status;
            manualReviewReason = 'AI failed; rule fallback used: ' + (err?.message || 'unknown');
        }
    }

    return buildResultEnvelope({
        record,
        ruleResult,
        status,
        engineUsed,
        modelProvider,
        modelVersion,
        fallbackUsed,
        manualReviewReason,
        aiSettings,
        masters,
        overrideIndustry,
        overrideCustomerType,
        overrideSecondary,
        confidenceOverride,
        evidenceOverride,
        keywordsOverride,
    });
}

export { decideStatusFromRules, runRuleEngine };
