import mongoose from 'mongoose';

const bankReconciliationSchema = new mongoose.Schema(
    {
        bankLineId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BankStatementLine',
            required: true,
            index: true,
        },
        cashBankAccountId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'CashBankAccount',
            required: true,
            index: true,
        },
        bookType: { type: String, enum: ['LedgerEntry'], default: 'LedgerEntry' },
        bookRefId: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry', required: true },
        voucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', default: null },
        voucherNo: { type: String, default: '' },
        matchKind: { type: String, enum: ['Auto', 'Possible', 'Manual'], required: true },
        matchPriority: { type: Number, default: 0, min: 0, max: 5 },
        matchReasons: { type: [String], default: [] },
        confidence: { type: Number, default: 0, min: 0, max: 100 },
        allocatedAmount: { type: Number, default: 0, min: 0 },
        dateToleranceDays: { type: Number, default: 3 },
        amountTolerance: { type: Number, default: 0 },
        dateDifferenceDays: { type: Number, default: 0 },
        narrationSimilarity: { type: Number, default: 0 },
        bankTxnDate: { type: Date, default: null },
        bookVoucherDate: { type: Date, default: null },
        reconciliationDate: { type: Date, default: null },
        groupId: { type: String, default: '' },
        status: {
            type: String,
            enum: ['Pending', 'Approved', 'Rejected', 'Undone', 'Reversed'],
            default: 'Pending',
            index: true,
        },
        remarks: { type: String, default: '' },
        undoReason: { type: String, default: '' },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        approvedAt: { type: Date, default: null },
        isUndone: { type: Boolean, default: false, index: true },
        undoneAt: { type: Date, default: null },
        undoneBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

bankReconciliationSchema.index(
    { bankLineId: 1, bookRefId: 1 },
    { unique: true, partialFilterExpression: { status: 'Approved', isUndone: false } },
);
bankReconciliationSchema.index({ cashBankAccountId: 1, status: 1, isUndone: 1 });
bankReconciliationSchema.index({ groupId: 1 });

const BankReconciliation = mongoose.model('BankReconciliation', bankReconciliationSchema);
export { BankReconciliation };
