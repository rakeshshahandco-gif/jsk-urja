import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    platformScoped: { type: Boolean, default: false },
    action: { type: String, trim: true, required: true, index: true },
    entityType: { type: String, trim: true, default: '' },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'release_audits' });

schema.index({ companyId: 1, createdAt: -1 });

const ReleaseAudit = mongoose.models.ReleaseAudit || mongoose.model('ReleaseAudit', schema);
export { ReleaseAudit };
export default ReleaseAudit;
