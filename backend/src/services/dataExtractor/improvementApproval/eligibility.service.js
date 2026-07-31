import mongoose from 'mongoose';
import { AiLearningImprovementProposal } from '../../../models/aiLearningImprovementProposal.model.js';
import { AiLearningFeedback } from '../../../models/aiLearningFeedback.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { getApprovalPolicy } from './policy.service.js';
import { proposalChecksum } from './normalize.util.js';
import { assertSourceView } from './permissions.util.js';

function notDeleted(extra = {}) {
    return { isDeleted: { $ne: true }, ...extra };
}

function oid(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
    return new mongoose.Types.ObjectId(String(id));
}

/**
 * Evaluate whether a Phase 19 proposal may enter / continue approval review.
 * Never modifies the proposal. Never activates configuration.
 */
export async function evaluateProposalEligibility(companyId, proposalId, user = null, opts = {}) {
    const policy = await getApprovalPolicy(companyId);
    const reasons = [];
    const _id = oid(proposalId);
    if (!_id) {
        return { eligible: false, reasons: ['PERMISSION_DENIED'], proposal: null, policy };
    }

    const proposal = await AiLearningImprovementProposal.findOne({ _id, ...notDeleted() }).lean();
    if (!proposal) {
        return { eligible: false, reasons: ['PERMISSION_DENIED'], proposal: null, policy };
    }
    if (String(proposal.companyId) !== String(companyId)) {
        return { eligible: false, reasons: ['FOREIGN_COMPANY'], proposal: null, policy };
    }

    if (user) {
        try {
            assertSourceView(user, proposal.sourceModule);
        } catch {
            reasons.push('PERMISSION_DENIED');
        }
    }

    if (proposal.executable === true) reasons.push('PROPOSAL_EXECUTABLE_TRUE');
    // Phase 19 keeps approvedForImplementation false; if somehow true, still not "implemented"
    // but block if someone tries to treat it as active — we require false for Phase 20 entry
    if (proposal.approvedForImplementation === true && !opts.allowFutureFlag) {
        // Still allow review of future-implementation-flagged drafts as documentation-only
        // but they must remain non-executable
    }

    if (!policy.allowedProposalStatuses.includes(proposal.status)) {
        reasons.push('PROPOSAL_STATUS_NOT_ELIGIBLE');
    }

    const feedbackIds = proposal.supportingFeedbackIds || [];
    if (!feedbackIds.length) reasons.push('MISSING_SUPPORTING_FEEDBACK');

    const feedback = feedbackIds.length
        ? await AiLearningFeedback.find({ _id: { $in: feedbackIds }, companyId, ...notDeleted() }).lean()
        : [];

    const sampleSize = Number(proposal.sampleSize || feedback.length || 0);
    if (sampleSize < policy.minimumSampleSize) reasons.push('INSUFFICIENT_SAMPLE');

    if (!policy.minimumAgreementLabels.includes(proposal.reviewerAgreement || '')) {
        if (proposal.reviewerAgreement === 'LOW_SAMPLE' || proposal.reviewerAgreement === 'CONFLICTED') {
            reasons.push(proposal.reviewerAgreement === 'CONFLICTED' ? 'UNRESOLVED_CONFLICT' : 'LOW_REVIEWER_AGREEMENT');
        } else {
            reasons.push('LOW_REVIEWER_AGREEMENT');
        }
    }

    if (policy.blockOnUnresolvedConflict) {
        const conflicted = feedback.some((f) => f.status === 'CONFLICTED');
        if (conflicted || proposal.reviewerAgreement === 'CONFLICTED') {
            if (!reasons.includes('UNRESOLVED_CONFLICT')) reasons.push('UNRESOLVED_CONFLICT');
        }
    }

    if (policy.blockOnOutdatedFeedback) {
        const outdated = feedback.filter((f) => ['SOURCE_VERSION_CHANGED', 'OUTDATED_FEEDBACK'].includes(f.status));
        if (outdated.length > 0 && outdated.length >= Math.ceil(feedback.length / 2)) {
            reasons.push('OUTDATED_SOURCE');
        }
    }

    if (policy.requireGroundTruthBeyondUserOpinion) {
        if (!proposal.groundTruthCategory || proposal.groundTruthCategory === 'USER_OPINION' || proposal.groundTruthCategory === 'UNKNOWN') {
            if (!(policy.allowUserOpinionWithConsensus && ['STRONG_AGREEMENT', 'MAJORITY_AGREEMENT'].includes(proposal.reviewerAgreement))) {
                reasons.push('MISSING_GROUND_TRUTH');
            }
        }
    }

    if (opts.expectedVersion != null && Number(opts.expectedVersion) !== Number(proposal.version)) {
        reasons.push('PROPOSAL_VERSION_CHANGED');
    }
    if (opts.expectedChecksum) {
        const current = proposalChecksum(proposal);
        if (current !== opts.expectedChecksum) reasons.push('CHECKSUM_MISMATCH');
    }

    const checksum = proposalChecksum(proposal);
    return {
        eligible: reasons.length === 0,
        reasons,
        proposal,
        checksum,
        sampleSize,
        feedbackCount: feedback.length,
        outdatedFeedbackCount: feedback.filter((f) => ['SOURCE_VERSION_CHANGED', 'OUTDATED_FEEDBACK'].includes(f.status)).length,
        conflictedFeedbackCount: feedback.filter((f) => f.status === 'CONFLICTED').length,
        policy,
        note: 'Eligibility does not activate or apply the proposal.',
    };
}

export async function assertEligibleOrThrow(companyId, proposalId, user, opts = {}) {
    const result = await evaluateProposalEligibility(companyId, proposalId, user, opts);
    if (!result.eligible) {
        throw new ApiError(400, `Proposal not eligible: ${result.reasons.join(', ')}`);
    }
    return result;
}
