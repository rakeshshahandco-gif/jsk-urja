import mongoose from 'mongoose';

const pettyCashEntrySchema = new mongoose.Schema(
    {
        date: { type: Date, required: true },
        externalVoucherNo: { type: String, trim: true, default: '' },
        billNo: { type: String, trim: true, default: '' },
        ledgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
        accountHead: { type: String, trim: true, default: '' },
        narration: { type: String, trim: true, default: '' },
        payment: { type: Number, default: 0, min: 0 },
        receipt: { type: Number, default: 0, min: 0 },
        balance: { type: Number, default: 0 },
        remarks: { type: String, trim: true, default: '' },
        entryKind: { type: String, enum: ['payment', 'receipt'], required: true },
        financialYear: { type: String, required: true, trim: true },
        status: { type: String, enum: ['draft', 'posted', 'cancelled'], default: 'draft' },
        accountingVoucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', default: null },
        importBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'PettyCashImportBatch', default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        postedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

pettyCashEntrySchema.index({ financialYear: 1, externalVoucherNo: 1 });
pettyCashEntrySchema.index({ financialYear: 1, date: -1 });
pettyCashEntrySchema.index({ status: 1, financialYear: 1 });

const PettyCashEntry = mongoose.model('PettyCashEntry', pettyCashEntrySchema);
export { PettyCashEntry };
export default PettyCashEntry;
