import { ENGINE_VERSION, DEFAULT_ACTIONS } from './constants.js';
import { normalizeScoringSettings, settingsFingerprint } from './settings.service.js';

function clamp(n, min = 0, max = 100) {
    return Math.max(min, Math.min(max, Math.round(Number(n) || 0)));
}

function uniq(list = []) {
    return [...new Set((list || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

function dimScore(id, label, score, maxScore, reason, evidence = [], source = 'phase_outputs') {
    const max = Math.max(0, Number(maxScore) || 0);
    const current = Math.max(0, Math.min(max, Math.round(Number(score) || 0)));
    return {
        id,
        label,
        weight: max,
        maxScore: max,
        score: current,
        reason,
        evidence: (evidence || []).slice(0, 8),
        source,
        active: true,
    };
}

function pickThreshold(list, score, key) {
    const sorted = [...(list || [])].sort((a, b) => Number(b.minScore) - Number(a.minScore));
    for (const row of sorted) {
        if (score >= Number(row.minScore || 0)) return row[key];
    }
    return sorted[sorted.length - 1]?.[key];
}

function chooseAction({ finalScore, priority, contact, recommendation, relevance }) {
    if (priority === 'MANUAL_REVIEW_REQUIRED') {
        return { action: DEFAULT_ACTIONS[6], reason: 'Score requires manual review before sales action' };
    }
    if (relevance?.status === 'IRRELEVANT' || priority === 'NO_PRIORITY' || finalScore < 35) {
        return { action: DEFAULT_ACTIONS[9], reason: 'Low priority / weak target-market fit' };
    }
    if (priority === 'CRITICAL' || finalScore >= 90) {
        return { action: DEFAULT_ACTIONS[0], reason: 'Critical/high score with strong fit signals' };
    }
    if (contact?.primaryContact?.isDecisionMakerCandidate && recommendation?.primaryRecommendation) {
        return { action: DEFAULT_ACTIONS[2], reason: 'Decision-maker and product opportunity available' };
    }
    if (contact?.status === 'GENERIC_CONTACT_ONLY' || (!contact?.primaryContact && contact?.genericFallbackContact)) {
        return { action: DEFAULT_ACTIONS[3], reason: 'Only generic contact available' };
    }
    if (!contact?.primaryContact && !contact?.genericFallbackContact) {
        return { action: DEFAULT_ACTIONS[6], reason: 'No public contact available' };
    }
    if (recommendation?.primaryRecommendation && /technical|oem|r&d/i.test(String(recommendation.recommendedSalesStrategy || ''))) {
        return { action: DEFAULT_ACTIONS[4], reason: 'Technical/OEM opportunity suggested' };
    }
    if (priority === 'HIGH') {
        return { action: DEFAULT_ACTIONS[1], reason: 'High priority — assign after review (no auto-assign)' };
    }
    if (priority === 'MEDIUM') {
        return { action: DEFAULT_ACTIONS[5], reason: 'Medium fit — create lead draft after review (no auto-create)' };
    }
    if (priority === 'LOW') {
        return { action: DEFAULT_ACTIONS[7], reason: 'Low priority — nurture later' };
    }
    return { action: DEFAULT_ACTIONS[8], reason: 'Score indicates low priority' };
}

export function scoreLeadRecord({
    record = {},
    classification = null,
    relevance = null,
    recommendation = null,
    contact = null,
    profile = null,
    settings: rawSettings = null,
    searchContext = null,
} = {}) {
    const settings = normalizeScoringSettings(rawSettings || {});
    const activeDims = (settings.dimensions || []).filter((d) => d.active !== false && Number(d.maxScore) > 0);
    const byId = Object.fromEntries(activeDims.map((d) => [d.id, d]));

    const positiveSignals = [];
    const negativeSignals = [];
    const penalties = [];
    const boosts = [];
    const dimensions = [];

    const industryConf = Number(classification?.confidenceScore);
    const classStatus = classification?.status || '';
    if (byId.industry_fit) {
        let s = 0;
        const max = byId.industry_fit.maxScore;
        if (classStatus === 'CLASSIFIED' && classification?.parentIndustry) {
            s = Math.round(max * (Number.isFinite(industryConf) ? Math.max(0.35, industryConf / 100) : 0.7));
            positiveSignals.push(`Primary industry classified: ${classification.parentIndustry}`);
        } else if (classStatus === 'LOW_CONFIDENCE') {
            s = Math.round(max * 0.35);
            negativeSignals.push('Low classification confidence');
        } else if (classStatus === 'MULTIPLE_POSSIBILITIES') {
            s = Math.round(max * 0.4);
            negativeSignals.push('Conflicting/multiple industry possibilities');
        } else {
            s = 0;
            negativeSignals.push('Industry classification incomplete');
        }
        dimensions.push(dimScore('industry_fit', byId.industry_fit.label, s, max,
            `Industry status ${classStatus || 'n/a'}; confidence ${Number.isFinite(industryConf) ? industryConf : 'n/a'}`,
            classification?.evidenceSnippets || [], 'phase6'));
    }

    if (byId.target_market_fit) {
        const max = byId.target_market_fit.maxScore;
        const relScore = Number(relevance?.relevanceScore);
        let s = 0;
        if (relevance?.status === 'RELEVANT') {
            s = Math.round(max * (Number.isFinite(relScore) ? Math.max(0.5, relScore / 100) : 0.8));
            positiveSignals.push(`Relevant target-market fit (${relScore || 'n/a'})`);
        } else if (relevance?.status === 'POSSIBLY_RELEVANT') {
            s = Math.round(max * 0.45);
            negativeSignals.push('Only possibly relevant');
        } else if (relevance?.status === 'IRRELEVANT') {
            s = Math.round(max * 0.05);
            negativeSignals.push('Marked irrelevant to target market');
        } else {
            s = Math.round(max * 0.2);
            negativeSignals.push('Relevance not confirmed');
        }
        dimensions.push(dimScore('target_market_fit', byId.target_market_fit.label, s, max,
            `Relevance ${relevance?.status || 'n/a'} score ${Number.isFinite(relScore) ? relScore : 'n/a'}`,
            relevance?.evidenceSnippets || [], 'phase7'));
    }

    if (byId.product_opportunity) {
        const max = byId.product_opportunity.maxScore;
        const opp = Number(recommendation?.opportunityScore ?? recommendation?.primaryRecommendation?.opportunityScore);
        let s = 0;
        if (recommendation?.primaryRecommendation?.productName) {
            s = Math.round(max * (Number.isFinite(opp) ? Math.max(0.4, opp / 100) : 0.7));
            positiveSignals.push(`Product opportunity: ${recommendation.primaryRecommendation.productName}`);
        } else if (recommendation?.status === 'LOW_CONFIDENCE') {
            s = Math.round(max * 0.25);
            negativeSignals.push('Low-confidence product opportunity');
        } else {
            s = 0;
            negativeSignals.push('No product opportunity recommended');
        }
        dimensions.push(dimScore('product_opportunity', byId.product_opportunity.label, s, max,
            recommendation?.primaryRecommendation?.productName
                ? `Primary product ${recommendation.primaryRecommendation.productName}`
                : 'No primary product',
            [recommendation?.primaryRecommendation?.reason].filter(Boolean), 'phase8'));
    }

    if (byId.customer_type_fit) {
        const max = byId.customer_type_fit.maxScore;
        const ct = classification?.customerType || relevance?.customerType || '';
        const s = ct ? max : 0;
        if (ct) positiveSignals.push(`Customer type: ${ct}`);
        else negativeSignals.push('Customer type unavailable');
        dimensions.push(dimScore('customer_type_fit', byId.customer_type_fit.label, s, max,
            ct ? `Customer type ${ct}` : 'Customer type missing', [], 'phase6'));
    }

    if (byId.contact_quality) {
        const max = byId.contact_quality.maxScore;
        let s = 0;
        if (contact?.primaryContact && !contact.primaryContact.isGenericCompanyContact) {
            s = Math.round(max * 0.85);
            if (contact.primaryContact.email) s = Math.min(max, s + 1);
            if (contact.primaryContact.phone) s = Math.min(max, s + 1);
            if (['SOURCE_VERIFIED', 'MULTIPLE_SOURCE_CONFIRMED', 'MANUALLY_VERIFIED'].includes(contact.primaryContact.verificationStatus)) {
                s = Math.min(max, s + 1);
                positiveSignals.push('Verified public contact channel');
            }
            positiveSignals.push('Named/primary public contact available');
        } else if (contact?.status === 'GENERIC_CONTACT_ONLY' || contact?.genericFallbackContact) {
            s = Math.round(max * 0.35);
            negativeSignals.push('Generic contact only');
        } else {
            s = 0;
            negativeSignals.push('No public contact');
        }
        dimensions.push(dimScore('contact_quality', byId.contact_quality.label, s, max,
            `Contact status ${contact?.status || 'n/a'}`, [], 'phase9'));
    }

    if (byId.decision_maker) {
        const max = byId.decision_maker.maxScore;
        const dm = !!contact?.primaryContact?.isDecisionMakerCandidate || Number(contact?.decisionMakerScore) >= 55;
        const s = dm ? max : 0;
        if (dm) positiveSignals.push('Decision-maker candidate available');
        dimensions.push(dimScore('decision_maker', byId.decision_maker.label, s, max,
            dm ? 'Decision-maker candidate flagged' : 'No decision-maker candidate', [], 'phase9'));
    }

    if (byId.data_completeness) {
        const max = byId.data_completeness.maxScore;
        const missing = profile?.missingInformation || [];
        const fields = [record.website, record.businessDescription || record.aiSummary, record.city || record.country, record.email || contact?.primaryContact?.email, record.phone || contact?.primaryContact?.phone];
        const present = fields.filter(Boolean).length;
        let s = Math.round((present / fields.length) * max);
        if (missing.length) {
            s = Math.max(0, s - Math.min(settings.maxMissingDataPenalty || 8, missing.length * (settings.missingDataPenaltyPerItem || 1)));
            negativeSignals.push(`Missing information items: ${missing.length}`);
        }
        dimensions.push(dimScore('data_completeness', byId.data_completeness.label, s, max,
            `${present}/${fields.length} core fields present`, missing.slice(0, 5), 'phase10'));
    }

    if (byId.source_reliability) {
        const max = byId.source_reliability.maxScore;
        const urls = uniq([record.website, record.sourceUrl, ...(profile?.sourceUrls || []), contact?.primaryContact?.sourceUrl].filter(Boolean));
        let s = Math.min(max, urls.length >= 2 ? max : urls.length === 1 ? Math.round(max * 0.7) : Math.round(max * 0.2));
        if (!urls.length) negativeSignals.push('Weak source reliability');
        else positiveSignals.push('Source URLs available');
        dimensions.push(dimScore('source_reliability', byId.source_reliability.label, s, max,
            `${urls.length} source URL(s)`, urls.slice(0, 3), 'provenance'));
    }

    if (byId.multi_source) {
        const max = byId.multi_source.maxScore;
        const multi = (contact?.contacts || []).some((c) => c.verificationStatus === 'MULTIPLE_SOURCE_CONFIRMED')
            || (contact?.primaryContact?.verificationStatus === 'MULTIPLE_SOURCE_CONFIRMED');
        const s = multi ? max : 0;
        if (multi) positiveSignals.push('Multiple-source confirmation');
        dimensions.push(dimScore('multi_source', byId.multi_source.label, s, max,
            multi ? 'Multi-source confirmed contact/field' : 'No multi-source confirmation', [], 'phase9'));
    }

    if (byId.geographic_fit) {
        const max = byId.geographic_fit.maxScore;
        const geo = [record.city, record.stateProvince, record.country].filter(Boolean).join(', ');
        const s = geo ? max : 0;
        if (geo) positiveSignals.push(`Geographic signals: ${geo}`);
        dimensions.push(dimScore('geographic_fit', byId.geographic_fit.label, s, max,
            geo || 'Geographic data missing', [], 'record'));
    }

    if (byId.search_intent) {
        const max = byId.search_intent.maxScore;
        const intent = searchContext?.searchKeyword || record.searchKeyword || record.keywords?.[0] || '';
        const hay = `${record.businessDescription || ''} ${classification?.parentIndustry || ''} ${recommendation?.primaryRecommendation?.productName || ''}`.toLowerCase();
        const hit = intent && hay.includes(String(intent).toLowerCase().split(/\s+/)[0] || '___');
        const s = intent ? (hit ? max : Math.round(max * 0.4)) : Math.round(max * 0.2);
        if (hit) positiveSignals.push('Search-intent match');
        dimensions.push(dimScore('search_intent', byId.search_intent.label, s, max,
            intent ? `Search intent "${intent}"` : 'No search intent', [], 'discovery'));
    }

    if (byId.opportunity_priority) {
        const max = byId.opportunity_priority.maxScore;
        const strat = String(recommendation?.recommendedSalesStrategy || recommendation?.primaryRecommendation?.salesStrategy || '');
        let s = 0;
        if (/high|critical/i.test(strat)) { s = max; positiveSignals.push('High opportunity priority strategy'); }
        else if (/medium/i.test(strat)) s = Math.round(max * 0.6);
        else if (strat) s = Math.round(max * 0.35);
        dimensions.push(dimScore('opportunity_priority', byId.opportunity_priority.label, s, max,
            strat || 'No sales strategy', [], 'phase8'));
    }

    if (byId.profile_confidence) {
        const max = byId.profile_confidence.maxScore;
        const conf = Number(profile?.confidence);
        let s = Number.isFinite(conf) ? Math.round(max * (conf / 100)) : Math.round(max * 0.3);
        if (profile?.status === 'OUTDATED') {
            s = Math.max(0, s - 1);
            negativeSignals.push('Company profile marked outdated');
        }
        if (Number.isFinite(conf) && conf >= 70) positiveSignals.push('Strong company profile confidence');
        dimensions.push(dimScore('profile_confidence', byId.profile_confidence.label, s, max,
            `Profile confidence ${Number.isFinite(conf) ? conf : 'n/a'} status ${profile?.status || 'n/a'}`, [], 'phase10'));
    }

    if (byId.entity_confidence) {
        const max = byId.entity_confidence.maxScore;
        const dup = String(record.duplicateStatus || record.entityResolutionStatus || record.duplicateDisplayLabel || '').toUpperCase();
        let s = max;
        if (/POSSIBLE_DUPLICATE|RELATED|AMBIGU/.test(dup)) {
            s = Math.round(max * 0.3);
            negativeSignals.push('Duplicate/entity ambiguity');
        } else if (/EXACT_DUPLICATE|CONFIRMED_DUPLICATE|EXISTING/.test(dup)) {
            s = Math.round(max * 0.2);
            negativeSignals.push('Possible existing/duplicate entity');
        } else if (/UNIQUE|NEW|/.test(dup) || !dup) {
            s = max;
        }
        dimensions.push(dimScore('entity_confidence', byId.entity_confidence.label, s, max,
            dup || 'No duplicate flag', [], 'phase4'));
    }

    // Explicit penalties (explainable deductions applied after weighted sum)
    let penaltyTotal = 0;
    function addPenalty(type, points, reason) {
        const pts = Math.max(0, Number(points) || 0);
        if (!pts) return;
        penaltyTotal += pts;
        penalties.push({ type, points: pts, reason });
        negativeSignals.push(reason);
    }

    if (contact?.status === 'NO_PUBLIC_CONTACT' || (!contact?.primaryContact && !contact?.genericFallbackContact && !record.email && !record.phone)) {
        addPenalty('no_contact', settings.noContactPenalty, `No-contact penalty (${settings.noContactPenalty})`);
    } else if (contact?.status === 'GENERIC_CONTACT_ONLY') {
        addPenalty('generic_contact', settings.genericContactPenalty, `Generic-contact penalty (${settings.genericContactPenalty})`);
    }

    const dup = String(record.duplicateStatus || record.entityResolutionStatus || '').toUpperCase();
    if (/POSSIBLE_DUPLICATE|RELATED|AMBIGU|EXACT_DUPLICATE/.test(dup)) {
        addPenalty('duplicate', settings.duplicatePenalty, `Duplicate ambiguity penalty (${settings.duplicatePenalty})`);
    }

    if (classStatus === 'MULTIPLE_POSSIBILITIES' || (classification?.warnings || []).length || (relevance?.warnings || []).length) {
        addPenalty('conflict', settings.conflictPenalty, `Conflicting evidence penalty (${settings.conflictPenalty})`);
    }

    const exclusionHit = [...(classification?.matchedExclusionTerms || []), ...(record.exclusionKeywordsMatched || [])].filter(Boolean);
    const negHit = [...(recommendation?.primaryRecommendation?.conflictingSignals || []), ...(classification?.negativeSignals || [])].filter(Boolean);
    if (exclusionHit.length || /exclusion|exclude/i.test(JSON.stringify(classification?.warnings || []))) {
        addPenalty('exclusion', settings.exclusionKeywordPenalty, `Exclusion keyword penalty (${settings.exclusionKeywordPenalty})`);
    } else if (negHit.length) {
        addPenalty('negative_keyword', Math.round((settings.exclusionKeywordPenalty || 12) / 2), `Negative/conflict signal penalty`);
    }

    if (profile?.status === 'OUTDATED') {
        addPenalty('outdated_profile', settings.outdatedProfilePenalty, `Outdated profile penalty (${settings.outdatedProfilePenalty})`);
    }

    // Stale data: if all upstream timestamps older than ~180 days conceptually via explicit stale flag
    if (record.stale === true || record.dataFreshness === 'stale') {
        addPenalty('stale_data', settings.staleDataPenalty, `Stale-data penalty (${settings.staleDataPenalty})`);
    }

    if (profile?.manuallyApproved || contact?.manuallyApproved || recommendation?.manuallyApproved) {
        const pts = Number(settings.manualApprovalBoost) || 0;
        if (pts) {
            boosts.push({ type: 'manual_approval', points: pts, reason: `Manual approval boost (+${pts})` });
            positiveSignals.push('Manual approval boost applied');
        }
    }

    const activeMax = dimensions.reduce((a, d) => a + Number(d.maxScore || 0), 0) || 1;
    const rawScore = dimensions.reduce((a, d) => a + Number(d.score || 0), 0);
    const weightedScore = rawScore; // weights already encoded as maxScore shares
    let finalScore = clamp((rawScore / activeMax) * 100);
    finalScore = clamp(finalScore - penaltyTotal + boosts.reduce((a, b) => a + Number(b.points || 0), 0));

    let confidence = 50;
    const confParts = [industryConf, Number(relevance?.relevanceScore), Number(recommendation?.confidence), Number(contact?.confidence), Number(profile?.confidence)].filter((n) => Number.isFinite(n));
    if (confParts.length) confidence = clamp(confParts.reduce((a, b) => a + b, 0) / confParts.length);
    if (finalScore < Number(settings.requireReviewBelowConfidence || 0) && confidence < Number(settings.requireReviewBelowConfidence || 45)) {
        // keep confidence as-is
    }

    let priority = pickThreshold(settings.priorityThresholds, finalScore, 'priority') || 'MEDIUM';
    let grade = pickThreshold(settings.gradeThresholds, finalScore, 'grade') || 'C';
    let status = 'SCORED';

    if (confidence < Number(settings.minimumConfidence || 40) || classStatus === 'LOW_CONFIDENCE') {
        status = 'LOW_CONFIDENCE';
    }
    if (
        finalScore < Number(settings.reviewBelowScore || 50)
        || relevance?.status === 'MANUAL_REVIEW'
        || classStatus === 'MANUAL_REVIEW_REQUIRED'
        || settings.scoringMode === 'manual_review'
    ) {
        status = 'MANUAL_REVIEW_REQUIRED';
        priority = 'MANUAL_REVIEW_REQUIRED';
    }

    // Irrelevant companies are scored low but never deleted
    if (relevance?.status === 'IRRELEVANT') {
        finalScore = Math.min(finalScore, 25);
        priority = finalScore < 35 ? 'NO_PRIORITY' : priority;
        grade = pickThreshold(settings.gradeThresholds, finalScore, 'grade') || 'D';
        negativeSignals.push('Irrelevant company retained with low score (not deleted)');
    }

    const action = chooseAction({ finalScore, priority, contact, recommendation, relevance });

    const sourceUrls = uniq([
        record.website, record.sourceUrl,
        ...(profile?.sourceUrls || []),
        contact?.primaryContact?.sourceUrl,
    ]);

    return {
        companyName: record.companyName || classification?.companyName || profile?.companyName || '',
        status,
        dimensionScores: dimensions,
        rawScore,
        weightedScore,
        finalScore,
        confidence,
        priority,
        grade,
        positiveSignals: uniq(positiveSignals),
        negativeSignals: uniq(negativeSignals),
        penalties,
        boosts,
        recommendation: action.action,
        recommendationReason: action.reason,
        reviewReason: status === 'MANUAL_REVIEW_REQUIRED' ? 'Score below review threshold or upstream review required' : '',
        engineUsed: 'rule_based',
        modelVersion: ENGINE_VERSION,
        settingsVersion: settingsFingerprint(settings),
        fallbackUsed: false,
        fallbackReason: '',
        preAiScore: finalScore,
        postAiScore: finalScore,
        aiAdjustment: null,
        evidenceReferences: dimensions.flatMap((d) => (d.evidence || []).map((e) => ({ dimension: d.id, value: e }))).slice(0, 40),
        sourceUrls,
        inputSnapshots: {
            classification: classification ? { status: classification.status, parentIndustry: classification.parentIndustry, customerType: classification.customerType, confidenceScore: classification.confidenceScore } : null,
            relevance: relevance ? { status: relevance.status, relevanceScore: relevance.relevanceScore } : null,
            recommendation: recommendation ? { status: recommendation.status, productName: recommendation.primaryRecommendation?.productName, opportunityScore: recommendation.opportunityScore } : null,
            contact: contact ? { status: contact.status, decisionMakerScore: contact.decisionMakerScore } : null,
            profile: profile ? { status: profile.status, confidence: profile.confidence } : null,
        },
        noAutoCrmCreate: true,
        noAutoCommunications: true,
        analysisTimestamp: new Date().toISOString(),
    };
}
