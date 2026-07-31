import mongoose from 'mongoose';

export const SPEC_STATUSES = ['DRAFT', 'FINALIZED', 'ARCHIVED'];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    approvalCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImprovementApprovalCase', required: true, index: true },
    proposalId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiLearningImprovementProposal', required: true, index: true },
    proposalVersion: { type: Number, required: true },
    specificationVersion: { type: Number, default: 1 },
    title: { type: String, trim: true, required: true },
    problemStatement: { type: String, trim: true, default: '' },
    approvedChange: { type: mongoose.Schema.Types.Mixed, default: null },
    currentConfigurationReference: { type: mongoose.Schema.Types.Mixed, default: null },
    targetConfiguration: { type: mongoose.Schema.Types.Mixed, default: null },
    configurationFamily: { type: String, trim: true, default: '' },
    scope: { type: [String], default: [] },
    outOfScope: { type: [String], default: [] },
    affectedModules: { type: [String], default: [] },
    affectedCompaniesEstimate: { type: Number, default: 0 },
    affectedIndustries: { type: [String], default: [] },
    dependencies: { type: [String], default: [] },
    acceptanceCriteria: { type: [String], default: [] },
    testScenarios: { type: [String], default: [] },
    regressionRequirements: { type: [String], default: [] },
    securityRequirements: { type: [String], default: [] },
    permissionRequirements: { type: [String], default: [] },
    tenantIsolationRequirements: { type: [String], default: [] },
    dataMigrationRequirements: { type: String, trim: true, default: 'None — Phase 20 does not migrate data' },
    rollbackPlan: { type: String, trim: true, default: '' },
    deploymentRestrictions: { type: [String], default: [] },
    effectiveDateRecommendation: { type: String, trim: true, default: '' },
    limitations: { type: [String], default: [] },
    requiredApprovers: { type: [String], default: [] },
    requiredFutureImplementationPhase: { type: String, default: 'Phase 21+' },
    requiredFutureActivationPhase: { type: String, default: 'Future controlled activation phase' },
    checksum: { type: String, trim: true, default: '' },
    executable: { type: Boolean, default: false },
    implementationRequired: { type: Boolean, default: true },
    status: { type: String, enum: SPEC_STATUSES, default: 'DRAFT', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'implementation_specifications' });

schema.index({ companyId: 1, status: 1, createdAt: -1 });
schema.index({ companyId: 1, approvalCaseId: 1 });

const ImplementationSpecification = mongoose.models.ImplementationSpecification
    || mongoose.model('ImplementationSpecification', schema);
export { ImplementationSpecification };
export default ImplementationSpecification;
