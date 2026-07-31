import mongoose from 'mongoose';

export const REVIEW_TYPES = [
    'BUSINESS_REVIEW', 'TECHNICAL_REVIEW', 'RISK_REVIEW', 'DATA_QUALITY_REVIEW',
    'PRIVACY_REVIEW', 'SECURITY_REVIEW', 'COMPLIANCE_REVIEW', 'FINAL_REVIEW',
];

export const REVIEW_DECISIONS = [
    'APPROVE', 'REJECT', 'NEEDS_MORE_EVIDENCE', 'APPROVE_WITH_CONDITIONS', 'ABSTAIN',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    approvalCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImprovementApprovalCase', required: true, index: true },
    proposalId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiLearningImprovementProposal', required: true, index: true },
    reviewType: { type: String, enum: REVIEW_TYPES, required: true, index: true },
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    decision: { type: String, enum: REVIEW_DECISIONS, required: true },
    comment: { type: String, trim: true, default: '' },
    conditions: { type: [String], default: [] },
    evidenceReferences: { type: [mongoose.Schema.Types.Mixed], default: [] },
    proposalVersion: { type: Number, default: 1 },
    reviewerRoleSnapshot: { type: String, trim: true, default: '' },
    reviewerPermission: { type: String, trim: true, default: '' },
    conflictDisclosure: { type: String, trim: true, default: '' },
    status: { type: String, trim: true, default: 'RECORDED' },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'improvement_approval_reviews' });

schema.index({ companyId: 1, approvalCaseId: 1, reviewType: 1, createdAt: -1 });

const ImprovementApprovalReview = mongoose.models.ImprovementApprovalReview
    || mongoose.model('ImprovementApprovalReview', schema);
export { ImprovementApprovalReview };
export default ImprovementApprovalReview;
