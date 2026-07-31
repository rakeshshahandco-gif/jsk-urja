import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    evaluationRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'SandboxEvaluationRun', required: true, index: true },
    code: { type: String, trim: true, required: true },
    summary: { type: String, trim: true, default: '' },
    rationale: { type: [String], default: [] },
    gateResult: { type: String, trim: true, default: '' },
    productionReady: { type: Boolean, default: false },
    advisoryOnly: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'sandbox_evaluation_recommendations' });

schema.index({ companyId: 1, evaluationRunId: 1 }, { unique: true });

const SandboxEvaluationRecommendation = mongoose.models.SandboxEvaluationRecommendation
    || mongoose.model('SandboxEvaluationRecommendation', schema);
export { SandboxEvaluationRecommendation };
export default SandboxEvaluationRecommendation;
