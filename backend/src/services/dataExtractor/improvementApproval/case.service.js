import mongoose from 'mongoose';
import { ImprovementApprovalCase } from '../../../models/improvementApprovalCase.model.js';
import { ImprovementApprovalReview } from '../../../models/improvementApprovalReview.model.js';
import { ImprovementApprovalHistory } from '../../../models/improvementApprovalHistory.model.js';
import { ImprovementApprovalAudit } from '../../../models/improvementApprovalAudit.model.js';
import { AiLearningImprovementProposal } from '../../../models/aiLearningImprovementProposal.model.js';
import { AiLearningFeedback } from '../../../models/aiLearningFeedback.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { ALLOWED_TRANSITIONS, PERMS, REVIEW_TYPE_PERMS } from './constants.js';
import {
    assertNoSecrets, rejectTenantOverrides, sanitizeComment, rejectUnsafeFilters, proposalChecksum,
} from './normalize.util.js';
import {
    assertView, assertSubmit, assertApprove, assertReject, assertRequestEvidence,
    assertReviewType, assertSourceView, isAggregateOnly, hasApproval,
} from './permissions.util.js';
import { getApprovalPolicy } from './policy.service.js';
import { assertEligibleOrThrow, evaluateProposalEligibility } from './eligibility.service.js';
import { assessRisk, buildImpactSummary, requiredReviewsFor } from './impact.service.js';

function notDeleted(extra = {}) {
    return { isDeleted: { $ne: true }, ...extra };
}

function oid(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
    return new mongoose.Types.ObjectId(String(id));
}

async function writeHistory(companyId, approvalCaseId, action, previousStatus, newStatus, userId, reason = '', metadata = {}) {
    assertNoSecrets(metadata);
    await ImprovementApprovalHistory.create({
        companyId, approvalCaseId, action, previousStatus, newStatus,
        changedBy: userId || null, reason: String(reason || '').slice(0, 500), metadata,
    });
}

async function writeAudit(companyId, userId, action, entityType, entityId, details = {}) {
    assertNoSecrets(details);
    await ImprovementApprovalAudit.create({
        companyId, action, entityType, entityId: entityId || null, userId: userId || null, details,
    });
}

function assertTransition(from, to) {
    const allowed = ALLOWED_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
        throw new ApiError(400, `Invalid status transition: ${from} → ${to}`);
    }
}

function publicCase(doc, user, extras = {}) {
    const aggregate = isAggregateOnly(user);
    return {
        id: String(doc._id),
        proposalId: String(doc.proposalId),
        proposalVersion: doc.proposalVersion,
        sourceProposalChecksum: doc.sourceProposalChecksum,
        status: doc.status,
        riskLevel: doc.riskLevel,
        businessReviewRequired: doc.businessReviewRequired,
        technicalReviewRequired: doc.technicalReviewRequired,
        riskReviewRequired: doc.riskReviewRequired,
        privacyReviewRequired: doc.privacyReviewRequired,
        securityReviewRequired: doc.securityReviewRequired,
        dataQualityReviewRequired: doc.dataQualityReviewRequired,
        complianceReviewRequired: doc.complianceReviewRequired,
        minimumApprovals: doc.minimumApprovals,
        approvalsReceived: doc.approvalsReceived,
        rejectionReason: aggregate ? undefined : doc.rejectionReason,
        evidenceRequirement: doc.evidenceRequirement,
        conditions: doc.conditions,
        eligibilitySnapshot: doc.eligibilitySnapshot,
        impactSummary: doc.impactSummary,
        riskFactors: doc.riskFactors,
        executable: false,
        createdBy: aggregate ? undefined : (doc.createdBy ? String(doc.createdBy) : null),
        submittedBy: aggregate ? undefined : (doc.submittedBy ? String(doc.submittedBy) : null),
        finalDecisionBy: aggregate ? undefined : (doc.finalDecisionBy ? String(doc.finalDecisionBy) : null),
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        note: 'Approved means APPROVED FOR IMPLEMENTATION SPECIFICATION only — never active/applied/deployed.',
        ...extras,
    };
}

export async function createCase(companyId, userId, body = {}, user = null) {
    assertSubmit(user);
    rejectTenantOverrides(body);
    rejectUnsafeFilters(body);
    assertNoSecrets(body);

    const policy = await getApprovalPolicy(companyId);
    if (!policy.enabled) throw new ApiError(400, 'Improvement Approval Center is disabled');

    const eligibility = await assertEligibleOrThrow(companyId, body.proposalId, user);
    const proposal = eligibility.proposal;
    assertSourceView(user, proposal.sourceModule);

    // Must remain non-executable
    if (proposal.executable !== false) throw new ApiError(400, 'Proposal not eligible: PROPOSAL_EXECUTABLE_TRUE');

    const existingOpen = await ImprovementApprovalCase.findOne({
        companyId,
        proposalId: proposal._id,
        status: { $nin: ['ARCHIVED', 'REJECTED'] },
        ...notDeleted(),
    }).lean();
    if (existingOpen) {
        throw new ApiError(400, `Open approval case already exists: ${existingOpen._id}`);
    }

    const risk = assessRisk(proposal, eligibility);
    const impact = buildImpactSummary(proposal, eligibility);
    const reviews = requiredReviewsFor(proposal, risk, policy);

    const doc = await ImprovementApprovalCase.create({
        companyId,
        proposalId: proposal._id,
        proposalVersion: proposal.version,
        sourceProposalChecksum: eligibility.checksum,
        status: 'DRAFT',
        riskLevel: risk.riskLevel,
        ...reviews,
        minimumApprovals: policy.minimumApprovalsForSpec,
        approvalsReceived: 0,
        eligibilitySnapshot: {
            sampleSize: eligibility.sampleSize,
            feedbackCount: eligibility.feedbackCount,
            reviewerAgreement: proposal.reviewerAgreement,
            groundTruthCategory: proposal.groundTruthCategory,
            outdatedFeedbackCount: eligibility.outdatedFeedbackCount,
            conflictedFeedbackCount: eligibility.conflictedFeedbackCount,
            reasons: eligibility.reasons,
        },
        impactSummary: impact,
        riskFactors: risk.riskFactors,
        executable: false,
        createdBy: userId,
        updatedBy: userId,
    });

    await writeHistory(companyId, doc._id, 'CREATED', '', 'DRAFT', userId, 'Approval case created');
    await writeAudit(companyId, userId, 'case_created', 'APPROVAL_CASE', doc._id, {
        proposalId: String(proposal._id),
        riskLevel: risk.riskLevel,
        executable: false,
    });

    return publicCase(doc.toObject(), user, {
        proposalSummary: summarizeProposal(proposal, user),
        riskAssessment: risk,
    });
}

function summarizeProposal(proposal, user) {
    const aggregate = isAggregateOnly(user);
    return {
        id: String(proposal._id),
        title: proposal.title,
        proposalType: proposal.proposalType,
        sourceModule: proposal.sourceModule,
        status: proposal.status,
        version: proposal.version,
        sampleSize: proposal.sampleSize,
        reviewerAgreement: proposal.reviewerAgreement,
        groundTruthCategory: proposal.groundTruthCategory,
        riskLevel: proposal.riskLevel,
        executable: false,
        approvedForImplementation: false,
        currentConfigurationReference: aggregate ? { restricted: true } : proposal.currentConfigurationReference,
        proposedConfiguration: aggregate ? { restricted: true } : proposal.proposedConfiguration,
        limitations: proposal.limitations,
        problemStatement: aggregate ? undefined : proposal.problemStatement,
    };
}

export async function listCases(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { companyId, ...notDeleted() };
    if (query.status) q.status = query.status;
    if (query.proposalId && oid(query.proposalId)) q.proposalId = oid(query.proposalId);
    const items = await ImprovementApprovalCase.find(q).sort({ createdAt: -1 }).limit(100).lean();
    return { items: items.map((c) => publicCase(c, user)), aggregateOnly: isAggregateOnly(user) };
}

export async function getCase(companyId, id, user = null) {
    assertView(user);
    const doc = await ImprovementApprovalCase.findOne({ _id: oid(id), companyId, ...notDeleted() }).lean();
    if (!doc) throw new ApiError(404, 'Approval case not found');
    const proposal = await AiLearningImprovementProposal.findOne({ _id: doc.proposalId, companyId, ...notDeleted() }).lean();
    const aggregate = isAggregateOnly(user);
    let sourceOk = true;
    if (proposal && !aggregate) {
        try { assertSourceView(user, proposal.sourceModule); }
        catch { sourceOk = false; }
    }
    if (proposal && !aggregate && !sourceOk) {
        throw new ApiError(403, `Missing source permission for module: ${proposal.sourceModule}`);
    }

    let supportingFeedback = [];
    if (proposal && !aggregate) {
        supportingFeedback = await AiLearningFeedback.find({
            _id: { $in: proposal.supportingFeedbackIds || [] },
            companyId,
            ...notDeleted(),
        }).limit(100).lean();
        supportingFeedback = supportingFeedback.map((f) => ({
            id: String(f._id),
            feedbackType: f.feedbackType,
            status: f.status,
            groundTruthCategory: f.groundTruthCategory,
            sourceVersion: f.sourceVersion,
            comment: f.comment,
        }));
    }

    const reviews = await ImprovementApprovalReview.find({
        companyId, approvalCaseId: doc._id, ...notDeleted(),
    }).sort({ createdAt: 1 }).lean();

    return publicCase(doc, user, {
        proposalSummary: proposal ? summarizeProposal(proposal, user) : null,
        supportingFeedback: isAggregateOnly(user) ? { count: proposal?.supportingFeedbackIds?.length || 0, restricted: true } : supportingFeedback,
        reviews: reviews.map((r) => ({
            id: String(r._id),
            reviewType: r.reviewType,
            decision: r.decision,
            comment: isAggregateOnly(user) ? undefined : r.comment,
            conditions: r.conditions,
            proposalVersion: r.proposalVersion,
            reviewerId: isAggregateOnly(user) ? undefined : String(r.reviewerId),
            createdAt: r.createdAt,
        })),
        configComparison: proposal && !isAggregateOnly(user) ? {
            current: proposal.currentConfigurationReference,
            proposed: proposal.proposedConfiguration,
        } : { restricted: isAggregateOnly(user) },
    });
}

export async function submitCase(companyId, userId, id, body = {}, user = null) {
    assertSubmit(user);
    rejectTenantOverrides(body);
    const doc = await ImprovementApprovalCase.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Approval case not found');

    // Re-check eligibility + checksum/version
    const eligibility = await assertEligibleOrThrow(companyId, doc.proposalId, user, {
        expectedVersion: doc.proposalVersion,
        expectedChecksum: doc.sourceProposalChecksum,
    });
    if (eligibility.proposal.executable !== false) {
        throw new ApiError(400, 'Proposal not eligible: PROPOSAL_EXECUTABLE_TRUE');
    }

    assertTransition(doc.status, 'SUBMITTED_FOR_REVIEW');
    const previous = doc.status;
    doc.status = 'SUBMITTED_FOR_REVIEW';
    doc.submittedBy = userId;
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'SUBMITTED', previous, 'SUBMITTED_FOR_REVIEW', userId, body.reason || 'Submitted for review');
    await writeAudit(companyId, userId, 'case_submitted', 'APPROVAL_CASE', doc._id, { status: 'SUBMITTED_FOR_REVIEW' });
    return publicCase(doc.toObject(), user);
}

export async function requestEvidence(companyId, userId, id, body = {}, user = null) {
    assertRequestEvidence(user);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const policy = await getApprovalPolicy(companyId);
    const doc = await ImprovementApprovalCase.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Approval case not found');

    const target = 'NEEDS_MORE_EVIDENCE';
    assertTransition(doc.status, target);
    const previous = doc.status;
    doc.status = target;
    doc.evidenceRequirement = {
        requestedAt: new Date().toISOString(),
        requestedBy: String(userId),
        needs: Array.isArray(body.needs) ? body.needs.map(String).slice(0, 20) : [String(body.reason || 'More evidence required')],
        note: 'Creates a review requirement only — does not collect or modify source data.',
    };
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'REQUEST_EVIDENCE', previous, target, userId, sanitizeComment(body.reason || 'More evidence', policy.commentMaximumLength));
    await writeAudit(companyId, userId, 'evidence_requested', 'APPROVAL_CASE', doc._id, { needs: doc.evidenceRequirement.needs });
    return publicCase(doc.toObject(), user);
}

export async function addReview(companyId, userId, id, body = {}, user = null) {
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    // Ignore forged reviewerId from body
    if (body.reviewerId != null) {
        // explicit rejection of forged identity
        throw new ApiError(400, 'reviewerId from request body is rejected; authenticated user is used');
    }

    const policy = await getApprovalPolicy(companyId);
    const reviewType = String(body.reviewType || '');
    assertReviewType(user, reviewType);

    const doc = await ImprovementApprovalCase.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Approval case not found');

    // Version / checksum guard
    const eligibility = await evaluateProposalEligibility(companyId, doc.proposalId, user, {
        expectedVersion: doc.proposalVersion,
        expectedChecksum: doc.sourceProposalChecksum,
    });
    if (eligibility.reasons.includes('PROPOSAL_VERSION_CHANGED') || eligibility.reasons.includes('CHECKSUM_MISMATCH')) {
        throw new ApiError(400, `Proposal not eligible: ${eligibility.reasons.filter((r) => ['PROPOSAL_VERSION_CHANGED', 'CHECKSUM_MISMATCH'].includes(r)).join(', ')}`);
    }
    if (eligibility.proposal) assertSourceView(user, eligibility.proposal.sourceModule);

    const decision = String(body.decision || '').toUpperCase();
    if (!['APPROVE', 'REJECT', 'NEEDS_MORE_EVIDENCE', 'APPROVE_WITH_CONDITIONS', 'ABSTAIN'].includes(decision)) {
        throw new ApiError(400, 'Invalid review decision');
    }

    // Separation of duties: creator cannot be final approver (checked at final decision);
    // business vs technical distinct reviewers
    if (policy.requireDistinctBusinessAndTechnicalReviewers) {
        if (reviewType === 'TECHNICAL_REVIEW') {
            const biz = await ImprovementApprovalReview.findOne({
                companyId, approvalCaseId: doc._id, reviewType: 'BUSINESS_REVIEW',
                decision: { $in: ['APPROVE', 'APPROVE_WITH_CONDITIONS'] },
                ...notDeleted(),
            }).lean();
            if (biz && String(biz.reviewerId) === String(userId)) {
                throw new ApiError(403, 'Business approver cannot also provide required technical approval');
            }
        }
    }

    const comment = sanitizeComment(body.comment || '', policy.commentMaximumLength);
    const conditions = Array.isArray(body.conditions)
        ? body.conditions.map(String).slice(0, policy.conditionsMaximumCount)
        : [];

    const review = await ImprovementApprovalReview.create({
        companyId,
        approvalCaseId: doc._id,
        proposalId: doc.proposalId,
        reviewType,
        reviewerId: userId, // authenticated only
        decision,
        comment,
        conditions,
        evidenceReferences: Array.isArray(body.evidenceReferences) ? body.evidenceReferences.slice(0, 20) : [],
        proposalVersion: doc.proposalVersion,
        reviewerRoleSnapshot: String(user?.roleName || user?.role?.name || '').slice(0, 80),
        reviewerPermission: REVIEW_TYPE_PERMS[reviewType] || '',
        conflictDisclosure: sanitizeComment(body.conflictDisclosure || '', 500),
        status: 'RECORDED',
    });

    if (conditions.length) {
        doc.conditions = [...new Set([...(doc.conditions || []), ...conditions])].slice(0, policy.conditionsMaximumCount);
    }

    const previous = doc.status;
    let next = doc.status;
    if (decision === 'REJECT') {
        assertReject(user);
        assertTransition(doc.status, 'REJECTED');
        next = 'REJECTED';
        doc.rejectionReason = comment || 'Rejected during review';
        doc.finalDecisionBy = userId;
    } else if (decision === 'NEEDS_MORE_EVIDENCE') {
        assertTransition(doc.status, 'NEEDS_MORE_EVIDENCE');
        next = 'NEEDS_MORE_EVIDENCE';
    } else if (decision === 'APPROVE' || decision === 'APPROVE_WITH_CONDITIONS') {
        if (['APPROVE', 'APPROVE_WITH_CONDITIONS'].includes(decision)) {
            doc.approvalsReceived = (doc.approvalsReceived || 0) + 1;
        }
        // Advance review stage when appropriate
        if (doc.status === 'SUBMITTED_FOR_REVIEW' && reviewType === 'BUSINESS_REVIEW') {
            assertTransition(doc.status, 'UNDER_BUSINESS_REVIEW');
            next = 'UNDER_BUSINESS_REVIEW';
        } else if (doc.status === 'UNDER_BUSINESS_REVIEW' && reviewType === 'TECHNICAL_REVIEW') {
            assertTransition(doc.status, 'UNDER_TECHNICAL_REVIEW');
            next = 'UNDER_TECHNICAL_REVIEW';
        } else if (doc.status === 'UNDER_TECHNICAL_REVIEW' && (reviewType === 'RISK_REVIEW' || !doc.riskReviewRequired)) {
            if (doc.riskReviewRequired && reviewType === 'RISK_REVIEW') {
                assertTransition(doc.status, 'UNDER_RISK_REVIEW');
                next = 'UNDER_RISK_REVIEW';
            } else if (!doc.riskReviewRequired) {
                assertTransition(doc.status, 'RECOMMENDED');
                next = 'RECOMMENDED';
            }
        } else if (doc.status === 'UNDER_RISK_REVIEW' && reviewType === 'RISK_REVIEW') {
            assertTransition(doc.status, 'RECOMMENDED');
            next = 'RECOMMENDED';
        } else if (doc.status === 'UNDER_BUSINESS_REVIEW' && reviewType === 'BUSINESS_REVIEW') {
            // stay / move to technical
            assertTransition(doc.status, 'UNDER_TECHNICAL_REVIEW');
            next = 'UNDER_TECHNICAL_REVIEW';
        }
    }

    // If approving and all required reviews are satisfied, advance to RECOMMENDED
    if (['APPROVE', 'APPROVE_WITH_CONDITIONS'].includes(decision) && next !== 'REJECTED' && next !== 'NEEDS_MORE_EVIDENCE') {
        const approving = await ImprovementApprovalReview.find({
            companyId, approvalCaseId: doc._id, ...notDeleted(),
            decision: { $in: ['APPROVE', 'APPROVE_WITH_CONDITIONS'] },
        }).lean();
        // include the review just created
        const types = new Set(approving.map((r) => r.reviewType).concat([reviewType]));
        const ready = (!doc.businessReviewRequired || types.has('BUSINESS_REVIEW'))
            && (!doc.technicalReviewRequired || types.has('TECHNICAL_REVIEW'))
            && (!doc.riskReviewRequired || types.has('RISK_REVIEW'))
            && (!doc.privacyReviewRequired || types.has('PRIVACY_REVIEW'))
            && (!doc.securityReviewRequired || types.has('SECURITY_REVIEW'));
        if (ready && ['UNDER_BUSINESS_REVIEW', 'UNDER_TECHNICAL_REVIEW', 'UNDER_RISK_REVIEW', 'SUBMITTED_FOR_REVIEW'].includes(next)) {
            if ((ALLOWED_TRANSITIONS[next] || []).includes('RECOMMENDED')) {
                next = 'RECOMMENDED';
            }
        }
    }

    doc.status = next;
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'REVIEWED', previous, next, userId, `${reviewType}:${decision}`);
    await writeAudit(companyId, userId, decision === 'REJECT' ? 'case_rejected' : 'review_recorded', 'APPROVAL_REVIEW', review._id, {
        reviewType, decision, caseStatus: next, executable: false,
    });

    return {
        review: {
            id: String(review._id),
            reviewType,
            decision,
            conditions,
            proposalVersion: doc.proposalVersion,
            reviewerId: String(userId),
        },
        case: publicCase(doc.toObject(), user),
    };
}

export async function finalDecision(companyId, userId, id, body = {}, user = null) {
    assertApprove(user);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    if (body.reviewerId != null) {
        throw new ApiError(400, 'reviewerId from request body is rejected; authenticated user is used');
    }

    const policy = await getApprovalPolicy(companyId);
    const doc = await ImprovementApprovalCase.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Approval case not found');

    const decision = String(body.decision || '').toUpperCase();
    if (!['APPROVE', 'REJECT'].includes(decision)) throw new ApiError(400, 'Final decision must be APPROVE or REJECT');

    // Checksum / version
    const eligibility = await evaluateProposalEligibility(companyId, doc.proposalId, user, {
        expectedVersion: doc.proposalVersion,
        expectedChecksum: doc.sourceProposalChecksum,
    });
    if (eligibility.reasons.includes('PROPOSAL_VERSION_CHANGED') || eligibility.reasons.includes('CHECKSUM_MISMATCH')) {
        throw new ApiError(400, `Proposal not eligible: ${eligibility.reasons.filter((r) => ['PROPOSAL_VERSION_CHANGED', 'CHECKSUM_MISMATCH'].includes(r)).join(', ')}`);
    }
    // Block final approve on unresolved eligibility where configured
    if (decision === 'APPROVE') {
        const blocking = eligibility.reasons.filter((r) => [
            'INSUFFICIENT_SAMPLE', 'LOW_REVIEWER_AGREEMENT', 'UNRESOLVED_CONFLICT', 'OUTDATED_SOURCE', 'MISSING_GROUND_TRUTH',
        ].includes(r));
        if (blocking.length) throw new ApiError(400, `Proposal not eligible: ${blocking.join(', ')}`);
    }

    if (policy.creatorCannotFinalApprove) {
        const creatorId = doc.createdBy || doc.submittedBy;
        if (creatorId && String(creatorId) === String(userId)) {
            throw new ApiError(403, 'Proposal/case creator cannot be final approver under separation-of-duties policy');
        }
        if (eligibility.proposal?.generatedBy && String(eligibility.proposal.generatedBy) === String(userId)) {
            throw new ApiError(403, 'Proposal creator cannot be final approver under separation-of-duties policy');
        }
    }

    if (decision === 'APPROVE') {
        // Required reviews complete?
        const reviews = await ImprovementApprovalReview.find({
            companyId, approvalCaseId: doc._id, ...notDeleted(),
            decision: { $in: ['APPROVE', 'APPROVE_WITH_CONDITIONS'] },
        }).lean();
        const has = (type) => reviews.some((r) => r.reviewType === type);
        if (doc.businessReviewRequired && !has('BUSINESS_REVIEW')) {
            throw new ApiError(400, 'Missing required BUSINESS_REVIEW');
        }
        if (doc.technicalReviewRequired && !has('TECHNICAL_REVIEW')) {
            throw new ApiError(400, 'Proposal not eligible: MISSING_TECHNICAL_REVIEW');
        }
        if (doc.riskReviewRequired && !has('RISK_REVIEW')) {
            throw new ApiError(400, 'Proposal not eligible: MISSING_RISK_REVIEW');
        }
        if (doc.privacyReviewRequired && !has('PRIVACY_REVIEW')) {
            throw new ApiError(400, 'Missing required PRIVACY_REVIEW');
        }
        if (doc.securityReviewRequired && !has('SECURITY_REVIEW')) {
            throw new ApiError(400, 'Missing required SECURITY_REVIEW');
        }
        if ((doc.approvalsReceived || 0) < (doc.minimumApprovals || policy.minimumApprovalsForSpec)) {
            // Count approve reviews as approvals if approvalsReceived lagging
            const approveCount = reviews.length;
            if (approveCount < (doc.minimumApprovals || policy.minimumApprovalsForSpec)) {
                throw new ApiError(400, `Insufficient approvals: need ${doc.minimumApprovals}, have ${approveCount}`);
            }
        }

        assertTransition(doc.status, 'APPROVED_FOR_IMPLEMENTATION_SPEC');
        const previous = doc.status;
        doc.status = 'APPROVED_FOR_IMPLEMENTATION_SPEC';
        doc.finalDecisionBy = userId;
        doc.updatedBy = userId;
        if (Array.isArray(body.conditions)) {
            doc.conditions = [...new Set([...(doc.conditions || []), ...body.conditions.map(String)])].slice(0, policy.conditionsMaximumCount);
        }
        await doc.save();

        // Record FINAL_REVIEW
        await ImprovementApprovalReview.create({
            companyId,
            approvalCaseId: doc._id,
            proposalId: doc.proposalId,
            reviewType: 'FINAL_REVIEW',
            reviewerId: userId,
            decision: body.conditions?.length ? 'APPROVE_WITH_CONDITIONS' : 'APPROVE',
            comment: sanitizeComment(body.comment || 'Approved for implementation specification', policy.commentMaximumLength),
            conditions: doc.conditions,
            proposalVersion: doc.proposalVersion,
            reviewerRoleSnapshot: String(user?.roleName || '').slice(0, 80),
            reviewerPermission: PERMS.approve,
            status: 'RECORDED',
        });

        await writeHistory(companyId, doc._id, 'FINAL_APPROVE', previous, 'APPROVED_FOR_IMPLEMENTATION_SPEC', userId, body.reason || 'Approved for implementation specification only');
        await writeAudit(companyId, userId, 'final_approved_for_spec', 'APPROVAL_CASE', doc._id, {
            executable: false,
            meaning: 'APPROVED_FOR_IMPLEMENTATION_SPECIFICATION',
            notActive: true,
            notApplied: true,
            notDeployed: true,
        });
    } else {
        assertReject(user);
        assertTransition(doc.status, 'REJECTED');
        const previous = doc.status;
        doc.status = 'REJECTED';
        doc.rejectionReason = sanitizeComment(body.reason || body.comment || 'Rejected', policy.commentMaximumLength);
        doc.finalDecisionBy = userId;
        doc.updatedBy = userId;
        await doc.save();
        await writeHistory(companyId, doc._id, 'FINAL_REJECT', previous, 'REJECTED', userId, doc.rejectionReason);
        await writeAudit(companyId, userId, 'case_rejected', 'APPROVAL_CASE', doc._id, { reason: doc.rejectionReason });
    }

    return publicCase(doc.toObject(), user);
}

export async function archiveCase(companyId, userId, id, user = null) {
    if (!hasApproval(user, PERMS.manage) && !hasApproval(user, PERMS.approve)) {
        throw new ApiError(403, `Missing permission: ${PERMS.manage}`);
    }
    const doc = await ImprovementApprovalCase.findOne({ _id: oid(id), companyId, ...notDeleted() });
    if (!doc) throw new ApiError(404, 'Approval case not found');
    assertTransition(doc.status, 'ARCHIVED');
    const previous = doc.status;
    doc.status = 'ARCHIVED';
    doc.updatedBy = userId;
    await doc.save();
    await writeHistory(companyId, doc._id, 'ARCHIVED', previous, 'ARCHIVED', userId, 'Archived');
    await writeAudit(companyId, userId, 'case_archived', 'APPROVAL_CASE', doc._id, {});
    return publicCase(doc.toObject(), user);
}

export async function getCaseHistory(companyId, id, user = null) {
    assertView(user);
    const items = await ImprovementApprovalHistory.find({
        companyId, approvalCaseId: oid(id), ...notDeleted(),
    }).sort({ createdAt: 1 }).limit(200).lean();
    return { items, appendOnly: true };
}

export async function listReviews(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const q = { companyId, ...notDeleted() };
    if (query.approvalCaseId && oid(query.approvalCaseId)) q.approvalCaseId = oid(query.approvalCaseId);
    const items = await ImprovementApprovalReview.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return {
        items: items.map((r) => ({
            id: String(r._id),
            approvalCaseId: String(r.approvalCaseId),
            reviewType: r.reviewType,
            decision: r.decision,
            comment: isAggregateOnly(user) ? undefined : r.comment,
            proposalVersion: r.proposalVersion,
            createdAt: r.createdAt,
        })),
    };
}

export { writeAudit, writeHistory, publicCase, assertTransition, summarizeProposal };
