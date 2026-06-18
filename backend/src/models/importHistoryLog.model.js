import mongoose from 'mongoose';

const importHistoryLogSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true },
        financialYear: { type: String, trim: true, default: '' },
        importType: { type: String, required: true, trim: true },
        sourceModule: { type: String, trim: true, default: 'import_center' },
        batchId: { type: mongoose.Schema.Types.ObjectId, default: null },
        fileName: { type: String, trim: true, default: '' },
        recordsTotal: { type: Number, default: 0 },
        recordsSuccess: { type: Number, default: 0 },
        recordsFailed: { type: Number, default: 0 },
        status: { type: String, enum: ['validated', 'posted', 'failed', 'dry_run', 'rejected'], default: 'validated' },
        dryRun: { type: Boolean, default: false },
        errorSummary: { type: String, default: '' },
        failedRows: [{ rowNumber: Number, reason: String }],
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

importHistoryLogSchema.index({ companyId: 1, createdAt: -1 });
importHistoryLogSchema.index({ importType: 1, financialYear: 1 });

const ImportHistoryLog = mongoose.model('ImportHistoryLog', importHistoryLogSchema);
export { ImportHistoryLog };
export default ImportHistoryLog;
