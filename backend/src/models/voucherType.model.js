import mongoose from 'mongoose';

const voucherTypeSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true }, // e.g., RCPT, PMT, CASHRCPT
    financialYear: { type: String, trim: true }, // e.g. "2025-2026"
    nature: {
        type: String,
        enum: ['Receipt', 'Payment', 'Contra', 'Journal', 'Sales', 'Purchase', 'Expense', 'Credit Note', 'Debit Note'],
        required: true
    },
    prefix: { type: String, default: '' },
    autoNumbering: { type: Boolean, default: true },
    startingNumber: { type: Number, default: 1 },
    nextNumber: { type: Number, default: 1 },

    active: { type: Boolean, default: true },
    remarks: { type: String, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

voucherTypeSchema.index({ companyId: 1, name: 1, financialYear: 1 }, { unique: true, sparse: true });

const VoucherType = mongoose.model('VoucherType', voucherTypeSchema);
export { VoucherType };
