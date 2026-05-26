import mongoose from 'mongoose';

const tcsChallanSchema = new mongoose.Schema({
    challanNo: { type: String, trim: true, default: '' },
    bsrCode: { type: String, trim: true, default: '' },
    depositDate: { type: Date, required: true },
    financialYear: { type: String, required: true, trim: true },
    quarter: { type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'], required: true },

    totalAmount: { type: Number, required: true, min: 0 },
    surchargeAmount: { type: Number, default: 0 },
    educationCessAmount: { type: Number, default: 0 },
    interestAmount: { type: Number, default: 0 },
    penaltyAmount: { type: Number, default: 0 },
    totalDeposited: { type: Number, required: true, min: 0 },

    bankName: { type: String, trim: true, default: '' },
    bankLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },

    status: { type: String, enum: ['Draft', 'Paid'], default: 'Draft' },
    narration: { type: String, default: '' },

    linkedDeductions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TcsDeduction' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

tcsChallanSchema.index({ financialYear: 1, quarter: 1 });

const TcsChallan = mongoose.model('TcsChallan', tcsChallanSchema);
export { TcsChallan };
