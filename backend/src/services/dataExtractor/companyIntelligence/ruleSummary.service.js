import { ENGINE_VERSION, NEXT_ACTIONS, CLAIM_LABELS } from './constants.js';

function uniq(list = []) {
    return [...new Set((list || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

function text(v, fallback = '') {
    const s = String(v || '').trim();
    return s || fallback;
}

function pickSourceUrls(record = {}, classification = null, relevance = null, recommendation = null, contact = null) {
    const urls = [];
    for (const u of [
        record.website, record.sourceUrl,
        ...(record.sourceUrls || []),
        ...(classification?.sourceUrls || []),
        ...(relevance?.sourceUrls || []),
        ...(recommendation?.sourceUrls || []),
        contact?.primaryContact?.sourceUrl,
        contact?.genericFallbackContact?.sourceUrl,
        ...(contact?.contacts || []).map((c) => c.sourceUrl),
    ]) {
        if (u) urls.push(String(u));
    }
    return uniq(urls).slice(0, 30);
}

function evidenceFrom(...parts) {
    const out = [];
    for (const part of parts) {
        if (!part) continue;
        if (Array.isArray(part)) {
            for (const e of part) {
                if (!e) continue;
                if (typeof e === 'string') out.push({ type: 'snippet', value: e.slice(0, 300) });
                else out.push(e);
            }
        } else if (typeof part === 'object') {
            out.push(part);
        }
    }
    return out.slice(0, 40);
}

export function chooseNextAction({ classification, relevance, recommendation, contact }) {
    const relevanceScore = Number(relevance?.relevanceScore);
    const status = relevance?.status || '';
    if (status === 'IRRELEVANT' || (Number.isFinite(relevanceScore) && relevanceScore < 30)) {
        return { action: NEXT_ACTIONS[9], reason: 'Low or irrelevant target-market fit from Phase 7' };
    }
    if (!classification || classification.status === 'FAILED' || classification.status === 'MANUAL_REVIEW_REQUIRED') {
        return { action: NEXT_ACTIONS[8], reason: 'Industry classification needs manual research or review' };
    }
    if (contact?.primaryContact?.email || contact?.primaryContact?.phone) {
        if (recommendation?.primaryRecommendation?.brochureUrl) {
            return { action: NEXT_ACTIONS[3], reason: 'Primary public contact and brochure URL are available' };
        }
        if (recommendation?.primaryRecommendation?.catalogUrl) {
            return { action: NEXT_ACTIONS[4], reason: 'Primary public contact and catalog URL are available' };
        }
        if (recommendation?.primaryRecommendation && /technical|oem|r&d/i.test(String(recommendation.recommendedSalesStrategy || recommendation.primaryRecommendation?.salesStrategy || ''))) {
            return { action: NEXT_ACTIONS[5], reason: 'Technical/OEM opportunity with public contact available' };
        }
        if (contact.primaryContact.isDecisionMakerCandidate) {
            return { action: NEXT_ACTIONS[1], reason: 'Decision-maker candidate contact is available' };
        }
        return { action: NEXT_ACTIONS[0], reason: 'Public contact exists and should be reviewed before outreach' };
    }
    if (contact?.genericFallbackContact?.email || contact?.status === 'GENERIC_CONTACT_ONLY') {
        return { action: NEXT_ACTIONS[6], reason: 'Only generic company contact available; request purchase/decision contact' };
    }
    if (recommendation?.primaryRecommendation && (relevanceScore >= 60 || status === 'RELEVANT')) {
        return { action: NEXT_ACTIONS[7], reason: 'Relevant opportunity exists; create lead draft after review (no auto-create)' };
    }
    if (!contact || contact.status === 'NO_PUBLIC_CONTACT') {
        return { action: NEXT_ACTIONS[8], reason: 'No public contact found; manual research required' };
    }
    return { action: NEXT_ACTIONS[2], reason: 'Share internal company profile for salesperson review' };
}

export function buildMissingInformation({ record, classification, relevance, recommendation, contact }) {
    const missing = [];
    if (!text(record?.website)) missing.push('Website not available');
    if (!text(record?.businessDescription || record?.aiSummary || classification?.evidenceSnippets?.[0])) {
        missing.push('Business description not available');
    }
    if (!classification?.parentIndustry) missing.push('Industry classification incomplete');
    if (!classification?.customerType && !relevance?.customerType) missing.push('Customer type not available');
    if (!relevance || relevance.status === 'MANUAL_REVIEW') missing.push('Relevance score needs review');
    if (!recommendation?.primaryRecommendation) missing.push('Product recommendation not available');
    if (!contact?.primaryContact && !contact?.genericFallbackContact) missing.push('Public contact not available');
    if (!text(record?.city) && !text(record?.country)) missing.push('Geographic location incomplete');
    if (!text(record?.email) && !(contact?.contacts || []).some((c) => c.email)) missing.push('Public email not available');
    if (!text(record?.phone || record?.mobile) && !(contact?.contacts || []).some((c) => c.phone)) {
        missing.push('Public phone not available');
    }
    return missing;
}

export function buildRuleBasedProfile({
    record = {},
    classification = null,
    relevance = null,
    recommendation = null,
    contact = null,
    mode = 'rule_based',
} = {}) {
    const companyName = text(record.companyName || classification?.companyName, 'Unknown company');
    const parentIndustry = text(classification?.parentIndustry || classification?.primaryIndustry);
    const subIndustry = text(classification?.subIndustry);
    const customerType = text(classification?.customerType || relevance?.customerType || record.customerType);
    const secondary = uniq([
        ...(classification?.secondaryIndustries || []),
        ...(classification?.alternativeIndustries || []).map((x) => x?.parentIndustry || x).filter(Boolean),
    ]).filter((x) => x && x !== parentIndustry);

    const productsDetected = uniq([
        ...(record.productCategories || []),
        ...(classification?.productSignals || []),
        ...(recommendation?.matchedSignals || []),
    ]).slice(0, 12);

    const applications = uniq([
        ...(classification?.applications || []),
        ...(recommendation?.primaryRecommendation?.applications || []),
        ...(relevance?.matchingProducts || []),
    ]).slice(0, 10);

    const geo = uniq([record.city, record.stateProvince, record.country, record.address].filter(Boolean)).join(', ');

    const strengths = uniq([
        parentIndustry ? `Classified industry: ${parentIndustry}${subIndustry ? ` / ${subIndustry}` : ''}` : '',
        customerType ? `Customer type: ${customerType}` : '',
        relevance?.relevanceScore != null ? `Relevance score ${relevance.relevanceScore} (${relevance.status || 'n/a'})` : '',
        recommendation?.primaryRecommendation?.productName
            ? `Recommended product: ${recommendation.primaryRecommendation.productName}`
            : '',
        contact?.primaryContact
            ? `Primary public contact available (${contact.primaryContact.contactRoleCategory || 'Unknown role'})`
            : '',
        productsDetected.length ? `Public product/service signals: ${productsDetected.slice(0, 3).join(', ')}` : '',
    ]);

    const risks = uniq([
        ...(classification?.warnings || []),
        ...(relevance?.warnings || []),
        ...(recommendation?.warnings || []),
        ...(contact?.warnings || []),
        classification?.status === 'LOW_CONFIDENCE' ? 'Industry classification is low confidence' : '',
        classification?.status === 'MULTIPLE_POSSIBILITIES' ? 'Multiple industry possibilities' : '',
        relevance?.status === 'POSSIBLY_RELEVANT' ? 'Relevance is only possible, not confirmed' : '',
        relevance?.status === 'IRRELEVANT' ? 'Marked irrelevant to target market' : '',
        contact?.status === 'NO_PUBLIC_CONTACT' ? 'No public contact found' : '',
        contact?.status === 'GENERIC_CONTACT_ONLY' ? 'Only generic company contact available' : '',
        recommendation?.status === 'LOW_CONFIDENCE' ? 'Product recommendation is low confidence' : '',
    ]);

    const missingInformation = buildMissingInformation({ record, classification, relevance, recommendation, contact });
    const next = chooseNextAction({ classification, relevance, recommendation, contact });

    const evidenceReferences = evidenceFrom(
        { type: 'company', field: 'companyName', value: companyName },
        text(record.businessDescription) ? { type: 'field', field: 'businessDescription', value: String(record.businessDescription).slice(0, 240) } : null,
        (classification?.evidenceSnippets || []).map((s) => ({ type: 'classification_evidence', value: String(s).slice(0, 240) })),
        (relevance?.evidenceSnippets || []).map((s) => ({ type: 'relevance_evidence', value: String(s).slice(0, 240) })),
        recommendation?.primaryRecommendation
            ? { type: 'recommendation', field: 'productName', value: recommendation.primaryRecommendation.productName }
            : null,
        contact?.primaryContact
            ? { type: 'contact', field: 'primaryContact', value: contact.primaryContact.contactName || contact.primaryContact.email || contact.primaryContact.phone }
            : null,
    );

    const sourceUrls = pickSourceUrls(record, classification, relevance, recommendation, contact);

    let confidence = 40;
    if (classification?.confidenceScore != null) confidence = Math.round((confidence + Number(classification.confidenceScore)) / 2);
    if (relevance?.relevanceScore != null) confidence = Math.round((confidence + Number(relevance.relevanceScore)) / 2);
    if (recommendation?.confidence != null) confidence = Math.round((confidence + Number(recommendation.confidence)) / 2);
    if (contact?.confidence != null) confidence = Math.round((confidence + Number(contact.confidence)) / 2);
    if (missingInformation.length >= 5) confidence = Math.min(confidence, 45);
    if (risks.some((r) => /irrelevant|no public contact/i.test(r))) confidence = Math.min(confidence, 50);
    confidence = Math.max(0, Math.min(100, confidence));

    const shortSummary = [
        `${companyName} appears to operate in ${parentIndustry || CLAIM_LABELS.NOT_AVAILABLE}${subIndustry ? ` (${subIndustry})` : ''}.`,
        customerType ? `Customer type: ${customerType}.` : '',
        recommendation?.primaryRecommendation?.productName
            ? `Possible opportunity: ${recommendation.primaryRecommendation.productName}.`
            : 'Product opportunity not yet recommended.',
        next.action ? `Next: ${next.action}.` : '',
    ].filter(Boolean).join(' ').slice(0, 480);

    const standardSummary = [
        shortSummary,
        text(record.businessDescription || record.aiSummary)
            ? `Public description: ${String(record.businessDescription || record.aiSummary).slice(0, 220)}`
            : `Public description: ${CLAIM_LABELS.NOT_AVAILABLE}.`,
        geo ? `Location signals: ${geo}.` : `Location: ${CLAIM_LABELS.NOT_AVAILABLE}.`,
        contact?.primaryContact
            ? `Primary public contact: ${contact.primaryContact.contactName || contact.primaryContact.email || contact.primaryContact.phone} (${contact.primaryContact.contactRoleCategory || 'Unknown'}).`
            : `Primary public contact: ${CLAIM_LABELS.NOT_AVAILABLE}.`,
        `Confidence ${confidence}%. Claims without source support are excluded.`,
    ].join(' ');

    const structuredSections = {
        executiveSummary: shortSummary,
        companyOverview: {
            companyName,
            website: text(record.website),
            description: text(record.businessDescription || record.aiSummary) || CLAIM_LABELS.NOT_AVAILABLE,
            legalOrTradingNames: uniq([record.legalName, record.tradingName].filter(Boolean)),
        },
        businessType: customerType || CLAIM_LABELS.NOT_AVAILABLE,
        primaryIndustry: parentIndustry || CLAIM_LABELS.NOT_AVAILABLE,
        secondaryIndustries: secondary,
        productsServicesDetected: productsDetected.length ? productsDetected : [CLAIM_LABELS.NOT_AVAILABLE],
        applicationsMarketsServed: applications.length ? applications : [CLAIM_LABELS.NOT_AVAILABLE],
        geographicPresence: geo || CLAIM_LABELS.NOT_AVAILABLE,
        customerType: customerType || CLAIM_LABELS.NOT_AVAILABLE,
        targetMarketFit: {
            status: relevance?.status || CLAIM_LABELS.NOT_AVAILABLE,
            score: relevance?.relevanceScore ?? null,
            notes: relevance?.whyRelevant || relevance?.summary || '',
        },
        recommendedProducts: {
            primary: recommendation?.primaryRecommendation || null,
            secondary: recommendation?.secondaryRecommendations || recommendation?.alternativeProducts || [],
            salesStrategy: recommendation?.recommendedSalesStrategy || recommendation?.primaryRecommendation?.salesStrategy || CLAIM_LABELS.NOT_AVAILABLE,
        },
        recommendedSalesStrategy: recommendation?.recommendedSalesStrategy || recommendation?.primaryRecommendation?.salesStrategy || CLAIM_LABELS.NOT_AVAILABLE,
        primaryPublicContact: contact?.primaryContact || null,
        secondaryPublicContacts: contact?.secondaryContacts || [],
        contactAvailability: {
            status: contact?.status || CLAIM_LABELS.NOT_AVAILABLE,
            hasEmail: !!(contact?.primaryContact?.email || contact?.genericFallbackContact?.email),
            hasPhone: !!(contact?.primaryContact?.phone || contact?.genericFallbackContact?.phone),
            genericFallback: contact?.genericFallbackContact || null,
        },
        opportunityStrengths: strengths,
        risksConflictingSignals: risks,
        missingInformation,
        recommendedNextAction: next.action,
        nextActionReason: next.reason,
        confidence,
        evidenceSources: evidenceReferences,
        sourceUrls,
        unsupportedClaimsPolicy: 'Financial scale, headcount, formal accreditations, capacity and similar facts are excluded unless present in collected sources.',
    };

    const detailedSummary = [
        `Executive summary: ${shortSummary}`,
        `Industry: ${structuredSections.primaryIndustry}`,
        `Customer type: ${structuredSections.customerType}`,
        `Fit: ${structuredSections.targetMarketFit.status} (${structuredSections.targetMarketFit.score ?? 'n/a'})`,
        `Recommended product: ${structuredSections.recommendedProducts.primary?.productName || CLAIM_LABELS.NOT_AVAILABLE}`,
        `Sales strategy: ${structuredSections.recommendedSalesStrategy}`,
        `Next action: ${next.action} — ${next.reason}`,
        `Missing: ${missingInformation.join('; ') || 'None listed'}`,
        `Risks: ${risks.join('; ') || 'None listed'}`,
    ].join('\n');

    let status = 'GENERATED';
    if (confidence < 45 || classification?.status === 'LOW_CONFIDENCE' || recommendation?.status === 'LOW_CONFIDENCE') {
        status = 'LOW_CONFIDENCE';
    }
    if (
        classification?.status === 'MANUAL_REVIEW_REQUIRED'
        || relevance?.status === 'MANUAL_REVIEW'
        || contact?.status === 'MANUAL_REVIEW_REQUIRED'
        || mode === 'manual_only'
    ) {
        status = 'MANUAL_REVIEW_REQUIRED';
    }

    return {
        companyName,
        status,
        shortSummary,
        standardSummary,
        detailedSummary,
        structuredSections,
        primaryIndustry: parentIndustry,
        secondaryIndustries: secondary,
        customerType,
        relevanceSnapshot: relevance ? {
            status: relevance.status,
            relevanceScore: relevance.relevanceScore,
            whyRelevant: relevance.whyRelevant || relevance.summary || '',
        } : null,
        recommendationSnapshot: recommendation ? {
            status: recommendation.status,
            productName: recommendation.primaryRecommendation?.productName || '',
            salesStrategy: recommendation.recommendedSalesStrategy || recommendation.primaryRecommendation?.salesStrategy || '',
            opportunityScore: recommendation.opportunityScore ?? recommendation.primaryRecommendation?.opportunityScore ?? null,
        } : null,
        contactSnapshot: contact ? {
            status: contact.status,
            primaryContact: contact.primaryContact || null,
            secondaryContacts: contact.secondaryContacts || [],
            genericFallbackContact: contact.genericFallbackContact || null,
            decisionMakerScore: contact.decisionMakerScore ?? null,
        } : null,
        strengths,
        risks,
        missingInformation,
        recommendedNextAction: next.action,
        nextActionReason: next.reason,
        confidence,
        evidenceReferences,
        sourceUrls,
        engineUsed: 'rule_based',
        modelVersion: ENGINE_VERSION,
        fallbackUsed: false,
        fallbackReason: '',
        analysisTimestamp: new Date().toISOString(),
        noAutoCommunications: true,
        noAutoCrmCreate: true,
    };
}
