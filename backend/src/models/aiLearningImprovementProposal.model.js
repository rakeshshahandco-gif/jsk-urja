import mongoose from 'mongoose';

export const PROPOSAL_TYPES = [
    'RULE_CHANGE_DRAFT', 'THRESHOLD_CHANGE_DRAFT', 'WEIGHT_CHANGE_DRAFT',
    'PROMPT_CHANGE_DRAFT', 'TEMPLATE_CHANGE_DRAFT', 'MAPPING_CHANGE_DRAFT',
    'VALIDATION_CHANGE_DRAFT', 'DATA_QUALITY_RULE_DRAFT', 'SOURCE_PRIORITY_CHANGE_DRAFT',
    'REVIEW_WORKFLOW_CHANGE_DRAFT', 'NO_CHANGE_RECOMMENDED',
];

export const PROPOSAL_STATUSES = [
    'DRAFT', 'UNDER_REVIEW', 'NEEDS_MORE_EVIDENCE', 'RECOMMENDED', 'REJECTED',
    'APPROVED_FOR_FUTURE_IMPLEMENTATION', 'ARCHIVED',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    proposalType: { type: String, enum: PROPOSAL_TYPES, required: true, index: true },
    sourceModule: { type: String, trim: true, required: true, index: true },
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: '' },
    problemStatement: { type: String, trim: true, default: '' },
    supportingFeedbackIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'AiLearningFeedback', default: [] },
    sampleSize: { type: Number, default: 0 },
    reviewerAgreement: { type: String, trim: true, default: 'LOW_SAMPLE' },
    groundTruthCategory: { type: String, trim: true, default: 'USER_OPINION' },
    confidence: { type: Number, default: 0 },
    impactEstimate: { type: String, trim: true, default: '' },
    riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
    currentConfigurationReference: { type: mongoose.Schema.Types.Mixed, default: null },
    proposedConfiguration: { type: mongoose.Schema.Types.Mixed, default: null },
    expectedBenefit: { type: String, trim: true, default: '' },
    potentialRisk: { type: String, trim: true, default: '' },
    affectedRecordsEstimate: { type: Number, default: 0 },
    evaluationPlan: { type: String, trim: true, default: '' },
    rollbackPlan: { type: String, trim: true, default: '' },
    evaluationMetrics: { type: mongoose.Schema.Types.Mixed, default: null },
    limitations: { type: [String], default: [] },
    status: { type: String, enum: PROPOSAL_STATUSES, default: 'DRAFT', index: true },
    version: { type: Number, default: 1 },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedForImplementation: { type: Boolean, default: false },
    executable: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ai_learning_improvement_proposals' });

schema.index({ companyId: 1, proposalType: 1, status: 1 });
schema.index({ companyId: 1, sourceModule: 1, createdAt: -1 });

const AiLearningImprovementProposal = mongoose.models.AiLearningImprovementProposal
    || mongoose.model('AiLearningImprovementProposal', schema);
export { AiLearningImprovementProposal };
export default AiLearningImprovementProposal;
