import mongoose from 'mongoose';

export const MERGE_REVIEW_STATUSES = ['open', 'resolved', 'ignored'];
export const MERGE_ACTIONS = [
    'keep_a', 'keep_b', 'merge_selected_fields', 'mark_separate', 'ignore', 'link_existing',
    'merge', 'keep_separate',
];

const discoveryMergeReviewSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, trim: true, default: '' },
        discoveryJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiscoveryJob', default: null, index: true },
        previewIndex: { type: Number, default: null },
        status: { type: String, enum: MERGE_REVIEW_STATUSES, default: 'open', index: true },
        decision: { type: String, default: 'MANUAL_REVIEW_REQUIRED' },
        matchScore: { type: Number, default: 0 },
        reasons: { type: [mongoose.Schema.Types.Mixed], default: [] },
        recordA: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        recordB: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        candidateRef: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        resolutionAction: { type: String, enum: MERGE_ACTIONS, default: undefined },
        mergedFields: { type: [String], default: [] },
        linkedRecord: { type: mongoose.Schema.Types.Mixed, default: null },
        resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        resolvedAt: { type: Date, default: null },
        notes: { type: String, default: '', maxlength: 2000 },
        auditLog: { type: [mongoose.Schema.Types.Mixed], default: [] },
        reviewKind: { type: String, trim: true, default: 'discovery_preview', index: true },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true, collection: 'discovery_merge_reviews' },
);

discoveryMergeReviewSchema.index({ companyId: 1, status: 1, createdAt: -1 });

const DiscoveryMergeReview = mongoose.models.DiscoveryMergeReview
    || mongoose.model('DiscoveryMergeReview', discoveryMergeReviewSchema);
export default DiscoveryMergeReview;
export { DiscoveryMergeReview };
