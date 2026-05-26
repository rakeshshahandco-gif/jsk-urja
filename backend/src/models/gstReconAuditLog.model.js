import mongoose from 'mongoose';

const gstReconAuditLogSchema = new mongoose.Schema(
    {
        action: {
            type: String,
            enum: ['Import', 'Reconcile', 'ManualOverride', 'ImportDuplicateWarning'],
            required: true,
            index: true,
        },
        financialYear: { type: String, index: true },
        month: { type: String, index: true },
        source: { type: String, enum: ['2A', '2B'], default: '2B' },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        importBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'GstrImportBatch', default: null },
        payload: { type: mongoose.Schema.Types.Mixed, default: null },
        reason: { type: String, default: '' },
    },
    { timestamps: true },
);

gstReconAuditLogSchema.index({ financialYear: 1, month: 1, createdAt: -1 });

const GstReconAuditLog = mongoose.model('GstReconAuditLog', gstReconAuditLogSchema);
export { GstReconAuditLog };
