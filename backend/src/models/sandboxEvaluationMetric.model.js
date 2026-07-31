import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    evaluationRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'SandboxEvaluationRun', required: true, index: true },
    metrics: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    sampleSize: { type: Number, default: 0 },
    verifiedGroundTruthRows: { type: Number, default: 0 },
    accuracyReported: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'sandbox_evaluation_metrics' });

schema.index({ companyId: 1, evaluationRunId: 1 }, { unique: true });

const SandboxEvaluationMetric = mongoose.models.SandboxEvaluationMetric
    || mongoose.model('SandboxEvaluationMetric', schema);
export { SandboxEvaluationMetric };
export default SandboxEvaluationMetric;
