import mongoose from 'mongoose';

const ledgerEntrySchema = new mongoose.Schema({
    voucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', required: true },
    voucherNo: { type: String, required: true },
    date: { type: Date, required: true },

    ledgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', required: true },
    ledgerName: { type: String, required: true },

    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ['Debit', 'Credit'], required: true },

    narration: { type: String, default: '' },

    // Links to balance source
    cashBankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashBankAccount' },
    financialYear: { type: String, trim: true }, // e.g. "2025-2026"

}, { timestamps: true });

ledgerEntrySchema.index({ ledgerId: 1, date: -1 });
ledgerEntrySchema.index({ voucherId: 1 });
ledgerEntrySchema.index({ date: 1 });
ledgerEntrySchema.index({ financialYear: 1 });

const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);
export { LedgerEntry };
