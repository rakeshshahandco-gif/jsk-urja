import mongoose from 'mongoose';

export const FEEDBACK_TYPES = [
    'ACCEPT', 'REJECT', 'CORRECT', 'INCORRECT', 'HELPFUL', 'NOT_HELPFUL',
    'RELEVANT', 'NOT_RELEVANT', 'TOO_HIGH', 'TOO_LOW', 'COMPLETE', 'INCOMPLETE',
    'CONFIRM_RELATIONSHIP', 'REJECT_RELATIONSHIP', 'CONFIRM_DUPLICATE', 'REJECT_DUPLICATE',
    'WRONG_INDUSTRY', 'WRONG_CUSTOMER_TYPE', 'WRONG_PRODUCT', 'WRONG_CONTACT_ROLE',
    'WRONG_SCORE', 'WRONG_REASON', 'WRONG_SOURCE', 'STALE_DATA', 'MISSING_DATA',
    'PRIVACY_CONCERN', 'OTHER',
];

export const FEEDBACK_STATUSES = [
    'SUBMITTED', 'VALIDATED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'DUPLICATE',
    'CONFLICTED', 'INCLUDED_IN_ANALYSIS', 'PROPOSAL_GENERATED', 'ARCHIVED',
    'SOURCE_VERSION_CHANGED', 'OUTDATED_FEEDBACK',
];

export const SOURCE_MODULES = [
    'industry_classification', 'customer_type_classification', 'lead_relevance',
    'product_recommendation', 'contact_intelligence', 'company_intelligence',
    'lead_scoring', 'similar_company', 'crm_enrichment', 'sales_workflow',
    'analytics', 'marketing_audience', 'marketing_message', 'sales_assistant',
    'knowledge_graph', 'duplicate_suggestion', 'manual_review', 'batch_quality',
    'data_quality', 'source_provenance',
];

export const GROUND_TRUTH_CATEGORIES = [
    'USER_OPINION', 'REVIEWER_CONSENSUS', 'VERIFIED_BUSINESS_FACT',
    'APPROVED_MASTER_DATA', 'CONFIRMED_OUTCOME', 'UNKNOWN',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sourceModule: { type: String, enum: SOURCE_MODULES, required: true, index: true },
    sourceRecordType: { type: String, trim: true, default: '' },
    sourceRecordId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    sourceVersion: { type: String, trim: true, default: '' },
    sourceSnapshotHash: { type: String, trim: true, default: '' },
    sourceStatus: { type: String, trim: true, default: '' },
    sourceUpdatedAt: { type: Date, default: null },
    sourceFreshnessAtFeedback: { type: String, enum: ['CURRENT', 'OUTDATED', 'UNKNOWN'], default: 'CURRENT' },
    outputType: { type: String, trim: true, default: '' },
    outputSummary: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    feedbackType: { type: String, enum: FEEDBACK_TYPES, required: true, index: true },
    reasonCode: { type: String, trim: true, default: '' },
    comment: { type: String, trim: true, default: '' },
    correctedLabel: { type: String, trim: true, default: '' },
    correctedValue: { type: mongoose.Schema.Types.Mixed, default: null },
    expectedRange: { type: mongoose.Schema.Types.Mixed, default: null },
    evidenceReferences: { type: [mongoose.Schema.Types.Mixed], default: [] },
    reviewerConfidence: { type: Number, default: null, min: 0, max: 100 },
    status: { type: String, enum: FEEDBACK_STATUSES, default: 'SUBMITTED', index: true },
    validationResult: { type: mongoose.Schema.Types.Mixed, default: null },
    groundTruthCategory: { type: String, enum: GROUND_TRUTH_CATEGORIES, default: 'USER_OPINION' },
    duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'AiLearningFeedback', default: null },
    conflictGroup: { type: String, trim: true, default: '', index: true },
    idempotencyKey: { type: String, trim: true, default: '', index: true },
    revisionOf: { type: mongoose.Schema.Types.ObjectId, ref: 'AiLearningFeedback', default: null },
    isLatestRevision: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true, collection: 'ai_learning_feedback' });

schema.index({ companyId: 1, sourceModule: 1, sourceRecordId: 1, createdAt: -1 });
schema.index({ companyId: 1, status: 1, createdAt: -1 });
schema.index({ companyId: 1, feedbackType: 1, createdAt: -1 });
schema.index({ companyId: 1, userId: 1, createdAt: -1 });
schema.index({ companyId: 1, conflictGroup: 1 });
schema.index(
    { companyId: 1, idempotencyKey: 1 },
    { unique: true, partialFilterExpression: { isDeleted: { $ne: true }, idempotencyKey: { $gt: '' } } },
);

const AiLearningFeedback = mongoose.models.AiLearningFeedback
    || mongoose.model('AiLearningFeedback', schema);
export { AiLearningFeedback };
export default AiLearningFeedback;
