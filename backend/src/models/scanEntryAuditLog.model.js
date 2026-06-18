import mongoose from 'mongoose';

const scanEntryAuditLogSchema = new mongoose.Schema(
    {
        draftId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScanEntryDraft', required: true },
        action: { type: String, required: true, trim: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
        newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    { timestamps: true },
);

scanEntryAuditLogSchema.index({ draftId: 1, createdAt: -1 });

const ScanEntryAuditLog = mongoose.model('ScanEntryAuditLog', scanEntryAuditLogSchema);
export { ScanEntryAuditLog };
export default ScanEntryAuditLog;

