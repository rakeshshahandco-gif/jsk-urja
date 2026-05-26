import mongoose from 'mongoose';

const tcsDeductionSchema = new mongoose.Schema({
    section: { type: String, required: true, trim: true, uppercase: true }, // e.g. "206C"
    sectionDescription: { type: String, trim: true, default: '' },
    buyerLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', required: true },
    buyerName: { type: String, required: true, trim: true },
    buyerPan: { type: String, trim: true, uppercase: true, default: '' },

    transactionDate: { type: Date, required: true },
    financialYear: { type: String, required: true, trim: true },
    quarter: { type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'], required: true },

    saleAmount: { type: Number, required: true, min: 0 },
    tcsRate: { type: Number, required: true, min: 0 },
    tcsAmount: { type: Number, required: true, min: 0 },

    // Source document
    sourceType: { type: String, enum: ['SalesInvoice', 'Receipt', 'Manual'], default: 'SalesInvoice' },
    sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sourceNo: { type: String, default: '' },

    // Linked voucher
    voucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', default: null },
    voucherNo: { type: String, default: '' },

    // Payable ledger
    tcsPayableLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },

    status: { type: String, enum: ['Pending', 'Challan Paid', 'Return Filed'], default: 'Pending' },
    challanId: { type: mongoose.Schema.Types.ObjectId, ref: 'TcsChallan', default: null },

    narration: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

tcsDeductionSchema.index({ financialYear: 1 });
tcsDeductionSchema.index({ section: 1 });
tcsDeductionSchema.index({ buyerLedgerId: 1 });
tcsDeductionSchema.index({ transactionDate: -1 });

const TcsDeduction = mongoose.model('TcsDeduction', tcsDeductionSchema);
export { TcsDeduction };
