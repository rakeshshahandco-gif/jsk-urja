import mongoose from 'mongoose';

export const COMPARISON_STATUSES = [
    'UNCHANGED_CORRECT', 'UNCHANGED_INCORRECT', 'IMPROVED', 'REGRESSED',
    'BASELINE_ONLY', 'CANDIDATE_ONLY', 'CHANGED_UNVERIFIED',
    'INSUFFICIENT_GROUND_TRUTH', 'NOT_APPLICABLE', 'EVALUATION_ERROR',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    evaluationRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'SandboxEvaluationRun', required: true, index: true },
    sourceRecordReference: { type: String, trim: true, default: '' },
    baselineOutput: { type: mongoose.Schema.Types.Mixed, default: null },
    candidateOutput: { type: mongoose.Schema.Types.Mixed, default: null },
    comparisonStatus: { type: String, enum: COMPARISON_STATUSES, required: true, index: true },
    groundTruth: { type: mongoose.Schema.Types.Mixed, default: null },
    groundTruthType: { type: String, trim: true, default: 'NONE' },
    baselineCorrectness: { type: String, enum: ['CORRECT', 'INCORRECT', 'UNKNOWN'], default: 'UNKNOWN' },
    candidateCorrectness: { type: String, enum: ['CORRECT', 'INCORRECT', 'UNKNOWN'], default: 'UNKNOWN' },
    improvementType: { type: String, trim: true, default: '' },
    regressionType: { type: String, trim: true, default: '' },
    riskFlags: { type: [String], default: [] },
    explanation: { type: String, trim: true, default: '' },
    redactionLevel: { type: String, default: 'STRICT' },
    executionMs: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'sandbox_evaluation_results' });

schema.index({ companyId: 1, evaluationRunId: 1, comparisonStatus: 1 });

const SandboxEvaluationResult = mongoose.models.SandboxEvaluationResult
    || mongoose.model('SandboxEvaluationResult', schema);
export { SandboxEvaluationResult };
export default SandboxEvaluationResult;
