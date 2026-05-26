import mongoose from 'mongoose';

// Each row imported from 26AS (TDS deducted by deductors on the assessee)
const form26AsLineSchema = new mongoose.Schema({
    deductorName: { type: String, trim: true, default: '' },
    deductorTan: { type: String, trim: true, uppercase: true, default: '' },
    section: { type: String, trim: true, uppercase: true, default: '' },
    transactionDate: { type: Date },
    amountPaid: { type: Number, default: 0 },
    tdsDeposited: { type: Number, default: 0 },
    bookingDate: { type: Date },
    bookingStatus: { type: String, default: '' },
    // Reconciliation
    matchStatus: {
        type: String,
        enum: ['Matched', 'Unmatched', 'Partial', 'Ignored'],
        default: 'Unmatched',
    },
    linkedDeductionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TdsDeduction', default: null },
});

const form26AsSchema = new mongoose.Schema({
    financialYear: { type: String, required: true, trim: true },
    quarter: { type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4', 'Annual'], default: 'Annual' },
    importedAt: { type: Date, default: Date.now },
    pan: { type: String, trim: true, uppercase: true, default: '' },
    lines: [form26AsLineSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

form26AsSchema.index({ financialYear: 1, quarter: 1 });

const Form26As = mongoose.model('Form26As', form26AsSchema);
export { Form26As };
