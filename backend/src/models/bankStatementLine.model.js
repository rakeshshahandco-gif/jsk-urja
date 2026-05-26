import mongoose from 'mongoose';

const bankStatementLineSchema = new mongoose.Schema(
    {
        importId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BankStatementImport',
            required: true,
            index: true,
        },
        cashBankAccountId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'CashBankAccount',
            required: true,
            index: true,
        },
        txnDate: { type: Date, required: true, index: true },
        valueDate: { type: Date, default: null },
        amount: { type: Number, required: true, min: 0 },
        runningBalance: { type: Number, default: null },
        drCr: { type: String, enum: ['Deposit', 'Withdrawal'], required: true },
        bankTxnId: { type: String, default: '' },
        sourceFileName: { type: String, default: '' },
        lineFingerprint: { type: String, default: '', index: true },
        narration: { type: String, default: '' },
        chequeNo: { type: String, default: '' },
        utrRef: { type: String, default: '' },
        counterpartyName: { type: String, default: '' },
        bankCharges: { type: Number, default: 0 },
        raw: { type: mongoose.Schema.Types.Mixed, default: null },
        matchStatus: {
            type: String,
            enum: [
                'Unmatched',
                'Suggested',
                'Possible',
                'AutoMatched',
                'Reconciled',
                'Ignored',
                'BankCharge',
                'Rejected',
                'Duplicate',
            ],
            default: 'Unmatched',
            index: true,
        },
        duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'BankStatementLine', default: null },
        reconciledAt: { type: Date, default: null },
        reconciledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true },
);

bankStatementLineSchema.index({ cashBankAccountId: 1, txnDate: -1, matchStatus: 1 });

const BankStatementLine = mongoose.model('BankStatementLine', bankStatementLineSchema);
export { BankStatementLine };
