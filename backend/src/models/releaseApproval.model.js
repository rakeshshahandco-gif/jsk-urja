import mongoose from 'mongoose';

export const REVIEW_TYPES = [
    'DEVELOPMENT_REVIEW', 'TECHNICAL_REVIEW', 'QA_REVIEW', 'SECURITY_REVIEW',
    'DATABASE_REVIEW', 'BUSINESS_REVIEW', 'INDUSTRY_REVIEW',
    'RELEASE_MANAGER_REVIEW', 'FINAL_PRODUCTION_PLAN_REVIEW',
];

export const REVIEW_DECISIONS = [
    'APPROVE', 'REJECT', 'NEEDS_CHANGES', 'NEEDS_EVIDENCE',
    'APPROVE_WITH_CONDITIONS', 'ABSTAIN',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    releaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReleasePackage', required: true, index: true },
    reviewType: { type: String, enum: REVIEW_TYPES, required: true },
    decision: { type: String, enum: REVIEW_DECISIONS, required: true },
    comment: { type: String, trim: true, default: '' },
    conditions: { type: [String], default: [] },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'release_approvals' });

schema.index({ releaseId: 1, reviewType: 1, createdAt: -1 });

const ReleaseApproval = mongoose.models.ReleaseApproval || mongoose.model('ReleaseApproval', schema);
export { ReleaseApproval };
export default ReleaseApproval;
