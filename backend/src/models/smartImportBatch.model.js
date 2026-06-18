import mongoose from 'mongoose';

const smartImportRowSchema = new mongoose.Schema(
    {
        rowNumber: Number,
        raw: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        mapped: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        errors: [String],
        warnings: [String],
        willCreateLedger: { type: Boolean, default: false },
        isValid: { type: Boolean, default: false },
        postedRefId: { type: mongoose.Schema.Types.ObjectId, default: null },
        postError: { type: String, default: '' },
    },
    { _id: false },
);

const smartImportBatchSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
        financialYear: { type: String, required: true, trim: true },
        importType: {
            type: String,
            enum: ['tally_ledger_master', 'tally_day_book', 'gstr2b_itc', 'excel_generic'],
            required: true,
        },
        fileName: { type: String, trim: true, default: '' },
        status: { type: String, enum: ['validated', 'posted', 'failed', 'dry_run'], default: 'validated' },
        dryRun: { type: Boolean, default: false },
        columnMapping: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        rows: [smartImportRowSchema],
        validCount: { type: Number, default: 0 },
        errorCount: { type: Number, default: 0 },
        postedCount: { type: Number, default: 0 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

smartImportBatchSchema.index({ financialYear: 1, importType: 1, status: 1 });

const SmartImportBatch = mongoose.model('SmartImportBatch', smartImportBatchSchema);
export { SmartImportBatch };
export default SmartImportBatch;
