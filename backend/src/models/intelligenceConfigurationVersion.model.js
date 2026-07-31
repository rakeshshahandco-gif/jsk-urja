import mongoose from 'mongoose';

export const VERSION_STATUSES = [
    'DRAFT', 'IN_REVIEW', 'VALIDATED', 'READY_FOR_SANDBOX', 'SANDBOX_TESTED',
    'APPROVED_FOR_FUTURE_ACTIVATION', 'RETIRED', 'REJECTED', 'ARCHIVED',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntelligenceConfigurationFamily', required: true, index: true },
    versionNumber: { type: Number, required: true },
    baseVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntelligenceConfigurationVersion', default: null },
    linkedProposalId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiLearningImprovementProposal', default: null },
    linkedApprovalCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImprovementApprovalCase', default: null },
    linkedImplementationSpecificationId: {
        type: mongoose.Schema.Types.ObjectId, ref: 'ImplementationSpecification', default: null, index: true,
    },
    configurationPayload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    payloadChecksum: { type: String, trim: true, default: '' },
    changeSummary: { type: String, trim: true, default: '' },
    reason: { type: String, trim: true, default: '' },
    scope: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    companyScope: { type: String, trim: true, default: 'OWN_COMPANY' },
    industryScope: { type: [String], default: [] },
    status: { type: String, enum: VERSION_STATUSES, default: 'DRAFT', index: true },
    validationStatus: { type: String, trim: true, default: 'NOT_RUN' },
    compatibilityStatus: { type: String, trim: true, default: 'UNKNOWN' },
    dependencyStatus: { type: String, trim: true, default: 'UNKNOWN' },
    effectiveDateRecommendation: { type: String, trim: true, default: '' },
    rollbackTargetVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntelligenceConfigurationVersion', default: null },
    immutableAfterPublish: { type: Boolean, default: false },
    runtimeActive: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true, collection: 'intelligence_configuration_versions' });

schema.index(
    { companyId: 1, familyId: 1, versionNumber: 1 },
    { unique: true, partialFilterExpression: { isDeleted: false } },
);
schema.index({ companyId: 1, status: 1, createdAt: -1 });

const IntelligenceConfigurationVersion = mongoose.models.IntelligenceConfigurationVersion
    || mongoose.model('IntelligenceConfigurationVersion', schema);
export { IntelligenceConfigurationVersion };
export default IntelligenceConfigurationVersion;
