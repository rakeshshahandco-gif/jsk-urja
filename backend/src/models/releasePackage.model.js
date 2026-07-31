import mongoose from 'mongoose';

export const RELEASE_TYPES = [
    'FEATURE_RELEASE', 'BUG_FIX', 'SECURITY_FIX', 'CONFIGURATION_RELEASE',
    'DATA_EXTRACTOR_RELEASE', 'AI_INTELLIGENCE_RELEASE', 'INDUSTRY_TEMPLATE_RELEASE',
    'COMPANY_SPECIFIC_RELEASE', 'HOTFIX_PLAN', 'ROLLBACK_PLAN',
    'DOCUMENTATION_ONLY', 'DATABASE_MIGRATION_PLAN',
];

export const RELEASE_STATUSES = [
    'DRAFT', 'VALIDATING', 'VALIDATION_FAILED', 'READY_FOR_REVIEW',
    'UNDER_TECHNICAL_REVIEW', 'UNDER_BUSINESS_REVIEW', 'UNDER_SECURITY_REVIEW',
    'UNDER_RELEASE_REVIEW', 'NEEDS_CHANGES',
    'APPROVED_FOR_STAGING_PLAN', 'STAGING_VALIDATION_RECORDED',
    'APPROVED_FOR_PILOT_PLAN', 'PILOT_VALIDATION_RECORDED',
    'APPROVED_FOR_FUTURE_PRODUCTION_PLAN', 'RELEASE_PACKAGE_FINALIZED', 'ARCHIVED',
];

export const READINESS = [
    'NOT_READY', 'READY_WITH_WARNINGS', 'READY_FOR_STAGING_PLAN',
    'READY_FOR_PILOT_PLAN', 'READY_FOR_FUTURE_PRODUCTION_REVIEW',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    platformScoped: { type: Boolean, default: false, index: true },
    releaseNumber: { type: String, trim: true, required: true },
    releaseName: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: '' },
    releaseType: { type: String, enum: RELEASE_TYPES, default: 'DATA_EXTRACTOR_RELEASE', index: true },
    sourceEnvironment: { type: String, enum: ['LOCALHOST', 'DEVELOPMENT', 'TESTING', 'STAGING'], required: true },
    targetEnvironment: { type: String, enum: ['LOCALHOST', 'DEVELOPMENT', 'TESTING', 'STAGING', 'PRODUCTION'], required: true, index: true },
    branchReference: { type: String, trim: true, default: '' },
    plannedCommitReference: { type: String, trim: true, default: '' },
    applicationVersion: { type: String, trim: true, default: '' },
    frontendVersion: { type: String, trim: true, default: '' },
    backendVersion: { type: String, trim: true, default: '' },
    databaseSchemaVersion: { type: String, trim: true, default: '' },
    includedModules: { type: [String], default: [] },
    excludedModules: { type: [String], default: [] },
    includedConfigurationVersionIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    implementationSpecificationIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    sandboxEvaluationRunIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    dependencySummary: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    compatibilitySummary: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    releaseNotes: { type: String, trim: true, default: '' },
    knownLimitations: { type: [String], default: [] },
    risks: { type: [String], default: [] },
    preDeploymentChecklist: { type: [mongoose.Schema.Types.Mixed], default: [] },
    smokeTestChecklist: { type: [mongoose.Schema.Types.Mixed], default: [] },
    postDeploymentChecklist: { type: [mongoose.Schema.Types.Mixed], default: [] },
    manifest: { type: mongoose.Schema.Types.Mixed, default: null },
    companyRollout: { type: [mongoose.Schema.Types.Mixed], default: [] },
    industryRollout: { type: [mongoose.Schema.Types.Mixed], default: [] },
    featureFlagPlan: { type: [mongoose.Schema.Types.Mixed], default: [] },
    moduleAllocation: { type: [mongoose.Schema.Types.Mixed], default: [] },
    backupPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    rollbackPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    migrationPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    healthCheckPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    smokeTestPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    monitoringPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    lastSimulation: { type: mongoose.Schema.Types.Mixed, default: null },
    approvalStatus: { type: String, trim: true, default: 'NONE' },
    readinessStatus: { type: String, enum: READINESS, default: 'NOT_READY', index: true },
    status: { type: String, enum: RELEASE_STATUSES, default: 'DRAFT', index: true },
    checksum: { type: String, trim: true, default: '' },
    executable: { type: Boolean, default: false },
    deploymentExecuted: { type: Boolean, default: false },
    productionActivated: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true, collection: 'release_packages' });

schema.index({ companyId: 1, releaseNumber: 1 }, { unique: true, partialFilterExpression: { isDeleted: false, platformScoped: false } });
schema.index({ platformScoped: 1, releaseNumber: 1 }, { unique: true, partialFilterExpression: { isDeleted: false, platformScoped: true } });
schema.index({ companyId: 1, status: 1, createdAt: -1 });

const ReleasePackage = mongoose.models.ReleasePackage || mongoose.model('ReleasePackage', schema);
export { ReleasePackage };
export default ReleasePackage;
