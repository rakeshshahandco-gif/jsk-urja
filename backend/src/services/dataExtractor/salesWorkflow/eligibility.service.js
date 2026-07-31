/**
 * Phase 14 — Sales workflow eligibility gate.
 * Only CRM leads that are ready for assignment/follow-up may enter the draft flow.
 */

const PREPARABLE = new Set([
    'ELIGIBLE',
    'ALREADY_ASSIGNED',
    'ASSIGNMENT_REVIEW_REQUIRED',
    'FOLLOWUP_REVIEW_REQUIRED',
]);

export function isPreparableEligibility(status) {
    return PREPARABLE.has(String(status || ''));
}

export function evaluateSalesWorkflowEligibility({
    crmLead = null,
    phase13Draft = null,
    existingDraft = null,
    companyId = null,
} = {}) {
    const reasons = [];

    if (!crmLead) {
        return { eligibilityStatus: 'NO_CRM_LEAD', preparable: false, reasons: ['No CRM lead provided'] };
    }

    if (crmLead.isDeleted === true) {
        return { eligibilityStatus: 'INVALID', preparable: false, reasons: ['CRM lead is deleted'] };
    }

    if (!crmLead._id && !crmLead.id) {
        return { eligibilityStatus: 'INVALID', preparable: false, reasons: ['CRM lead missing id'] };
    }

    // Tenant isolation: when companyId is supplied, lead.companyId must match.
    if (companyId != null && crmLead.companyId != null
        && String(crmLead.companyId) !== String(companyId)) {
        return {
            eligibilityStatus: 'BLOCKED',
            preparable: false,
            reasons: ['CRM lead belongs to a foreign company'],
        };
    }

    if (existingDraft?.locked) {
        return { eligibilityStatus: 'LOCKED', preparable: false, reasons: ['Existing sales workflow draft is locked'] };
    }

    if (['REJECTED', 'CANCELLED'].includes(String(existingDraft?.status || ''))) {
        reasons.push(`Prior draft status was ${existingDraft.status}`);
    }

    if (phase13Draft) {
        const p13Status = String(phase13Draft.status || '');
        const convertedOk = ['CONVERTED_TO_LEAD', 'ENRICHED_EXISTING_RECORD'].includes(p13Status)
            || !!phase13Draft.convertedCrmLeadId;
        if (!convertedOk && !phase13Draft.manuallyApproved && p13Status !== 'APPROVED') {
            return {
                eligibilityStatus: 'PENDING_PHASE13_APPROVAL',
                preparable: false,
                reasons: [`Phase 13 draft not ready (status=${p13Status || 'unknown'})`],
            };
        }
        if (['REJECTED', 'CANCELLED', 'BLOCKED'].includes(p13Status)
            || ['BLOCKED', 'NOT_APPROVED'].includes(String(phase13Draft.eligibilityStatus || ''))) {
            return {
                eligibilityStatus: 'BLOCKED',
                preparable: false,
                reasons: ['Phase 13 draft is blocked/rejected'],
            };
        }
        reasons.push('Phase 13 draft available');
    }

    const leadStatus = String(crmLead.status || '').toLowerCase();
    if (['lost'].includes(leadStatus)) {
        return { eligibilityStatus: 'BLOCKED', preparable: false, reasons: ['CRM lead status is lost'] };
    }

    const ownerId = crmLead.assignedTo || crmLead.assignedToUserId || crmLead.ownerUserId || null;
    if (ownerId) {
        reasons.push('Lead already has an owner — reassignment requires explicit approval');
        return {
            eligibilityStatus: 'ALREADY_ASSIGNED',
            preparable: true,
            reasons,
        };
    }

    reasons.push('CRM lead eligible for sales workflow');
    return { eligibilityStatus: 'ELIGIBLE', preparable: true, reasons };
}
