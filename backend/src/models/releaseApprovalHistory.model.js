import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    releaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReleasePackage', required: true, index: true },
    action: { type: String, trim: true, required: true },
    previousStatus: { type: String, trim: true, default: '' },
    newStatus: { type: String, trim: true, default: '' },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, trim: true, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'release_approval_history' });

schema.index({ releaseId: 1, createdAt: 1 });

const ReleaseApprovalHistory = mongoose.models.ReleaseApprovalHistory
    || mongoose.model('ReleaseApprovalHistory', schema);
export { ReleaseApprovalHistory };
export default ReleaseApprovalHistory;
