/**
 * Only approved / enrichment-ready intelligence may enter Phase 13.
 */
export function evaluateEligibility({
    extractedLead = null,
    recommendation = null,
    contact = null,
    profile = null,
    score = null,
    similarResult = null,
} = {}) {
    const reasons = [];
    const refs = {};

    if (!extractedLead && !similarResult) {
        return { eligibilityStatus: 'INVALID', reasons: ['No source record'], approvedIntelligenceRefs: refs };
    }

    if (extractedLead?.status === 'converted' || extractedLead?.convertedTo?.refId) {
        return { eligibilityStatus: 'ALREADY_CONVERTED', reasons: ['Already converted to CRM'], approvedIntelligenceRefs: refs };
    }
    if (extractedLead?.status === 'rejected') {
        return { eligibilityStatus: 'BLOCKED', reasons: ['Rejected record cannot enrich CRM'], approvedIntelligenceRefs: refs };
    }
    if (extractedLead?.duplicateStatus === 'confirmed_duplicate') {
        return { eligibilityStatus: 'DUPLICATE_REVIEW_REQUIRED', reasons: ['Confirmed duplicate'], approvedIntelligenceRefs: refs };
    }

    let approved = false;
    if (extractedLead && ['approved', 'reviewed'].includes(extractedLead.status)) {
        approved = true;
        refs.extractedLeadApproved = true;
        reasons.push('Extracted lead manually approved');
    }
    if (recommendation && (recommendation.manuallyApproved || recommendation.status === 'APPROVED')) {
        approved = true;
        refs.recommendationId = recommendation._id || true;
        reasons.push('Approved product recommendation');
    }
    if (contact && (contact.manuallyApproved || contact.status === 'APPROVED' || contact.status === 'VERIFIED')) {
        approved = true;
        refs.contactId = contact._id || true;
        reasons.push('Approved contact intelligence');
    }
    if (profile && (profile.manuallyApproved || profile.status === 'APPROVED')) {
        approved = true;
        refs.profileId = profile._id || true;
        reasons.push('Approved company intelligence profile');
    }
    if (score && (score.manuallyApproved || score.status === 'APPROVED' || score.status === 'LOCKED')) {
        approved = true;
        refs.scoreId = score._id || true;
        reasons.push('Approved lead score');
    }
    if (similarResult && similarResult.status === 'APPROVED_FOR_ENRICHMENT') {
        approved = true;
        refs.similarCompanyResultId = similarResult._id || true;
        reasons.push('Similar company approved for enrichment');
    }
    if (similarResult && ['REJECTED', 'IRRELEVANT'].includes(similarResult.status)) {
        return { eligibilityStatus: 'BLOCKED', reasons: ['Rejected/irrelevant similar candidate'], approvedIntelligenceRefs: refs };
    }
    if (similarResult && ['RELATED_COMPANY_REVIEW', 'POSSIBLE_BRANCH_REVIEW'].includes(similarResult.status)) {
        return {
            eligibilityStatus: 'CONFLICT_REVIEW_REQUIRED',
            reasons: ['Related/branch candidate requires separate review — do not auto-link'],
            approvedIntelligenceRefs: refs,
        };
    }

    if (!approved) {
        return { eligibilityStatus: 'NOT_APPROVED', reasons: reasons.length ? reasons : ['No approved intelligence'], approvedIntelligenceRefs: refs };
    }

    const confidences = [
        Number(recommendation?.confidence),
        Number(contact?.confidence),
        Number(profile?.confidence),
        Number(score?.confidence),
        Number(similarResult?.confidence),
    ].filter((n) => Number.isFinite(n));
    if (confidences.length && confidences.every((c) => c < 40)) {
        return { eligibilityStatus: 'LOW_CONFIDENCE_REVIEW', reasons: [...reasons, 'Low confidence across intelligence'], approvedIntelligenceRefs: refs };
    }

    return { eligibilityStatus: 'ELIGIBLE', reasons, approvedIntelligenceRefs: refs };
}
