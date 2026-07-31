import mongoose from 'mongoose';

export const APPROVAL_CASE_STATUSES = [
    'DRAFT',
    'SUBMITTED_FOR_REVIEW',
    'UNDER_BUSINESS_REVIEW',
    'UNDER_TECHNICAL_REVIEW',
    'UNDER_RISK_REVIEW',
    'NEEDS_MORE_EVIDENCE',
    'RECOMMENDED',
    'REJECTED',
    'APPROVED_FOR_IMPLEMENTATION_SPEC',
    'IMPLEMENTATION_SPEC_GENERATED',
    'ARCHIVED',
];

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    proposalId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiLearningImprovementProposal', required: true, index: true },
    proposalVersion: { type: Number, required: true, default: 1 },
    sourceProposalChecksum: { type: String, trim: true, required: true },
    status: { type: String, enum: APPROVAL_CASE_STATUSES, default: 'DRAFT', index: true },
    riskLevel: { type: String, enum: RISK_LEVELS, default: 'MEDIUM', index: true },
    businessReviewRequired: { type: Boolean, default: true },
    technicalReviewRequired: { type: Boolean, default: true },
    riskReviewRequired: { type: Boolean, default: false },
    privacyReviewRequired: { type: Boolean, default: false },
    securityReviewRequired: { type: Boolean, default: false },
    dataQualityReviewRequired: { type: Boolean, default: false },
    complianceReviewRequired: { type: Boolean, default: false },
    minimumApprovals: { type: Number, default: 2 },
    approvalsReceived: { type: Number, default: 0 },
    rejectionReason: { type: String, trim: true, default: '' },
    evidenceRequirement: { type: mongoose.Schema.Types.Mixed, default: null },
    conditions: { type: [String], default: [] },
    eligibilitySnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    impactSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    riskFactors: { type: [String], default: [] },
    executable: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    finalDecisionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true, collection: 'improvement_approval_cases' });

schema.index({ companyId: 1, status: 1, createdAt: -1 });
schema.index({ companyId: 1, proposalId: 1, createdAt: -1 });

const ImprovementApprovalCase = mongoose.models.ImprovementApprovalCase
    || mongoose.model('ImprovementApprovalCase', schema);
export { ImprovementApprovalCase };
export default ImprovementApprovalCase;
