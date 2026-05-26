import mongoose from 'mongoose';

const pdcChequeSchema = new mongoose.Schema({
    type: { type: String, enum: ['Receivable', 'Payable'], required: true },
    partyLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', required: true },
    partyName: { type: String, required: true, trim: true },

    chequeNo: { type: String, required: true, trim: true },
    chequeDate: { type: Date, required: true },   // future / post-dated date
    amount: { type: Number, required: true, min: 0.01 },

    bankName: { type: String, trim: true, default: '' },
    bankLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
    bankLedgerName: { type: String, default: '' },

    narration: { type: String, trim: true, default: '' },
    financialYear: { type: String, trim: true },

    status: {
        type: String,
        enum: ['Pending', 'Presented', 'Cleared', 'Bounced', 'Cancelled'],
        default: 'Pending',
    },

    // Set when presented / realised
    presentedDate: { type: Date, default: null },
    clearedDate: { type: Date, default: null },

    // Linked voucher when PDC is cleared
    clearedVoucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', default: null },
    clearedVoucherNo: { type: String, default: '' },

    bounceReason: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

pdcChequeSchema.index({ chequeDate: 1 });
pdcChequeSchema.index({ status: 1 });
pdcChequeSchema.index({ partyLedgerId: 1 });
pdcChequeSchema.index({ financialYear: 1 });

const PdcCheque = mongoose.model('PdcCheque', pdcChequeSchema);
export { PdcCheque };
