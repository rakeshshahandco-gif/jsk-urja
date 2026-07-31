import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    evaluationRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'SandboxEvaluationRun', required: true, index: true },
    severity: { type: String, enum: ['INFO', 'WARNING', 'ERROR'], default: 'WARNING' },
    code: { type: String, trim: true, required: true },
    message: { type: String, trim: true, required: true },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'sandbox_evaluation_issues' });

schema.index({ companyId: 1, evaluationRunId: 1, severity: 1 });

const SandboxEvaluationIssue = mongoose.models.SandboxEvaluationIssue
    || mongoose.model('SandboxEvaluationIssue', schema);
export { SandboxEvaluationIssue };
export default SandboxEvaluationIssue;
