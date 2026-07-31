import mongoose from 'mongoose';

export const RUN_STATUSES = [
    'DRAFT', 'VALIDATING', 'READY', 'RUNNING', 'COMPLETED',
    'COMPLETED_WITH_WARNINGS', 'FAILED', 'CANCELLED', 'ARCHIVED',
];

export const EVALUATION_MODES = [
    'DRY_RUN', 'HISTORICAL_SIMULATION', 'FIXTURE_COMPARISON', 'FEEDBACK_ALIGNMENT',
    'OUTCOME_ALIGNMENT', 'PERFORMANCE_BENCHMARK', 'SECURITY_VALIDATION',
    'TENANT_ISOLATION_VALIDATION', 'AGGREGATE_ONLY_VALIDATION',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntelligenceConfigurationFamily', required: true, index: true },
    familyCode: { type: String, trim: true, required: true, index: true },
    baselineVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntelligenceConfigurationVersion', required: true },
    candidateVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntelligenceConfigurationVersion', required: true, index: true },
    datasetId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiLearningEvaluationDataset', default: null },
    datasetKind: { type: String, enum: ['PHASE19_DATASET', 'SYNTHETIC', 'FIXTURE', 'HISTORICAL_READONLY'], default: 'SYNTHETIC' },
    evaluationMode: { type: String, enum: EVALUATION_MODES, default: 'DRY_RUN', index: true },
    status: { type: String, enum: RUN_STATUSES, default: 'DRAFT', index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    recordCount: { type: Number, default: 0 },
    resultCount: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    checksum: { type: String, trim: true, default: '' },
    configurationSnapshotHashes: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    isolationMode: { type: String, default: 'IN_MEMORY_NON_MUTATING' },
    validationReport: { type: mongoose.Schema.Types.Mixed, default: null },
    gateResult: { type: String, enum: ['PASS', 'PASS_WITH_WARNINGS', 'FAIL', 'INCONCLUSIVE', 'NOT_RUN'], default: 'NOT_RUN' },
    recommendationCode: { type: String, trim: true, default: '' },
    errorSummary: { type: String, trim: true, default: '' },
    cancelRequested: { type: Boolean, default: false },
    runtimeActivation: { type: Boolean, default: false },
    sourceMutated: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true, collection: 'sandbox_evaluation_runs' });

schema.index({ companyId: 1, status: 1, createdAt: -1 });

const SandboxEvaluationRun = mongoose.models.SandboxEvaluationRun
    || mongoose.model('SandboxEvaluationRun', schema);
export { SandboxEvaluationRun };
export default SandboxEvaluationRun;
