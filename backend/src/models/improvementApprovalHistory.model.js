import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    approvalCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImprovementApprovalCase', required: true, index: true },
    action: { type: String, trim: true, required: true },
    previousStatus: { type: String, trim: true, default: '' },
    newStatus: { type: String, trim: true, default: '' },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, trim: true, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'improvement_approval_history' });

schema.index({ companyId: 1, approvalCaseId: 1, createdAt: 1 });

const ImprovementApprovalHistory = mongoose.models.ImprovementApprovalHistory
    || mongoose.model('ImprovementApprovalHistory', schema);
export { ImprovementApprovalHistory };
export default ImprovementApprovalHistory;
