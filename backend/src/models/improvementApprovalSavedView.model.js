import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, trim: true, required: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scope: { type: String, enum: ['PERSONAL', 'COMPANY'], default: 'PERSONAL', index: true },
    filters: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'improvement_approval_saved_views' });

schema.index({ companyId: 1, scope: 1, ownerUserId: 1, name: 1 });

const ImprovementApprovalSavedView = mongoose.models.ImprovementApprovalSavedView
    || mongoose.model('ImprovementApprovalSavedView', schema);
export { ImprovementApprovalSavedView };
export default ImprovementApprovalSavedView;
