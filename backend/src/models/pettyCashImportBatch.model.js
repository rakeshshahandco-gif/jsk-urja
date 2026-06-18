import mongoose from 'mongoose';

const importRowSchema = new mongoose.Schema(
    {
        rowNumber: Number,
        date: String,
        accountHead: String,
        narration: String,
        payment: Number,
        receipt: Number,
        balance: Number,
        externalVoucherNo: String,
        billNo: String,
        remarks: String,
        errors: [String],
        warnings: [String],
        willCreateLedger: { type: Boolean, default: false },
        isValid: { type: Boolean, default: false },
    },
    { _id: false },
);

const pettyCashImportBatchSchema = new mongoose.Schema(
    {
        fileName: { type: String, trim: true, default: '' },
        financialYear: { type: String, required: true, trim: true },
        status: { type: String, enum: ['validated', 'posted', 'failed'], default: 'validated' },
        rows: [importRowSchema],
        validCount: { type: Number, default: 0 },
        errorCount: { type: Number, default: 0 },
        postedCount: { type: Number, default: 0 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

const PettyCashImportBatch = mongoose.model('PettyCashImportBatch', pettyCashImportBatchSchema);
export { PettyCashImportBatch };
export default PettyCashImportBatch;
