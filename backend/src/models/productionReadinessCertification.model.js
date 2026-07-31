import mongoose from 'mongoose';

export const CERT_STATUSES = [
    'DRAFT', 'SCOPE_DEFINED', 'EVIDENCE_COLLECTION', 'AUTOMATED_LOCAL_CHECKS',
    'MANUAL_REVIEW', 'FINDINGS_REVIEW', 'REMEDIATION_REQUIRED', 'REMEDIATION_REVIEW',
    'FINAL_REVIEW', 'READY_FOR_STAGING_REVIEW', 'READY_FOR_CONTROLLED_PILOT_REVIEW',
    'REJECTED', 'EXPIRED', 'ARCHIVED',
];

export const READINESS_OUTCOMES = [
    'NOT_READY', 'READY_WITH_CRITICAL_BLOCKERS', 'READY_WITH_MAJOR_BLOCKERS',
    'READY_WITH_MINOR_CONDITIONS', 'READY_FOR_STAGING_REVIEW', 'READY_FOR_CONTROLLED_PILOT_REVIEW',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    platformScoped: { type: Boolean, default: false, index: true },
    certificationNumber: { type: String, trim: true, required: true },
    certificationName: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: '' },
    releasePackageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReleasePackage', required: true, index: true },
    releasePackageVersion: { type: String, trim: true, default: '' },
    releasePackageChecksum: { type: String, trim: true, default: '' },
    targetEnvironment: { type: String, trim: true, default: 'STAGING' },
    companyScope: { type: [mongoose.Schema.Types.Mixed], default: [] },
    industryScope: { type: [String], default: [] },
    modulesIncluded: { type: [String], default: [] },
    configurationVersions: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    sandboxEvaluationReferences: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    implementationSpecificationReferences: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    assessmentDomains: { type: [String], default: [] },
    status: { type: String, enum: CERT_STATUSES, default: 'DRAFT', index: true },
    overallRisk: { type: String, default: 'UNKNOWN' },
    overallReadiness: { type: String, enum: READINESS_OUTCOMES, default: 'NOT_READY', index: true },
    blockerCount: { type: Number, default: 0 },
    criticalFindingCount: { type: Number, default: 0 },
    majorFindingCount: { type: Number, default: 0 },
    minorFindingCount: { type: Number, default: 0 },
    conditionCount: { type: Number, default: 0 },
    exceptionCount: { type: Number, default: 0 },
    evidenceCompleteness: { type: Number, default: 0 },
    requiredReviews: { type: [String], default: [] },
    certificationRecommendation: { type: String, default: 'NOT_READY' },
    releaseValidation: { type: mongoose.Schema.Types.Mixed, default: null },
    localCheckSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    lastBenchmark: { type: mongoose.Schema.Types.Mixed, default: null },
    knownLimitations: { type: [String], default: [] },
    checksum: { type: String, trim: true, default: '' },
    executable: { type: Boolean, default: false },
    deploymentAuthorized: { type: Boolean, default: false },
    productionApproved: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true, collection: 'production_readiness_certifications' });

schema.index({ companyId: 1, certificationNumber: 1 }, { unique: true, partialFilterExpression: { isDeleted: false, platformScoped: false } });
schema.index({ platformScoped: 1, certificationNumber: 1 }, { unique: true, partialFilterExpression: { isDeleted: false, platformScoped: true } });
schema.index({ companyId: 1, status: 1, createdAt: -1 });
schema.index({ releasePackageId: 1, createdAt: -1 });

const ProductionReadinessCertification = mongoose.models.ProductionReadinessCertification
    || mongoose.model('ProductionReadinessCertification', schema);
export { ProductionReadinessCertification };
export default ProductionReadinessCertification;
