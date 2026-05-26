import mongoose from 'mongoose';

const bankReconAuditLogSchema = new mongoose.Schema(
    {
        action: {
            type: String,
            enum: [
                'Import',
                'ImportDuplicateWarning',
                'AutoMatch',
                'Approve',
                'Reject',
                'ManualMatch',
                'Ignore',
                'BankCharge',
                'Undo',
                'DeleteImport',
                'VoucherCreateIntent',
            ],
            required: true,
            index: true,
        },
        cashBankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashBankAccount', index: true },
        importId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankStatementImport', default: null },
        bankLineId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankStatementLine', default: null },
        reconciliationId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankReconciliation', default: null },
        voucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', default: null },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        payload: { type: mongoose.Schema.Types.Mixed, default: null },
        previousState: { type: mongoose.Schema.Types.Mixed, default: null },
        newState: { type: mongoose.Schema.Types.Mixed, default: null },
        reason: { type: String, default: '' },
    },
    { timestamps: true },
);

bankReconAuditLogSchema.index({ cashBankAccountId: 1, createdAt: -1 });

const BankReconAuditLog = mongoose.model('BankReconAuditLog', bankReconAuditLogSchema);
export { BankReconAuditLog };
