import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, trim: true, required: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scope: { type: String, enum: ['PERSONAL', 'COMPANY'], default: 'PERSONAL' },
    filters: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'sandbox_evaluation_saved_views' });

const SandboxEvaluationSavedView = mongoose.models.SandboxEvaluationSavedView
    || mongoose.model('SandboxEvaluationSavedView', schema);
export { SandboxEvaluationSavedView };
export default SandboxEvaluationSavedView;
