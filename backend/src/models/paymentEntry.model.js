import mongoose from 'mongoose';

const paymentEntrySchema = new mongoose.Schema({
    // Invoice link
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseInvoice', required: true },
    invoiceNumber: { type: String, default: '' },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    supplierName: { type: String, default: '' },
    invoiceTotal: { type: Number, default: 0 },

    // Core payment fields
    paymentDate: { type: Date, required: true, default: Date.now },
    paymentMode: {
        type: String,
        enum: ['Cash', 'UPI', 'Cheque', 'Net Banking', 'NEFT/RTGS/IMPS', 'Card', 'Other'],
        required: true,
    },
    amountPaid: { type: Number, required: true, min: 0.01 },

    // Cash-specific
    cashAccount: { type: String, default: 'Main Cash' },

    // Bank-specific (Net Banking, NEFT/RTGS/IMPS, Card)
    bankName: { type: String, default: '' },
    fromAccount: { type: String, default: '' },
    transactionId: { type: String, default: '' },  // UTR / Reference No

    // UPI-specific
    upiApp: { type: String, default: '' },          // GPay, PhonePe, etc.
    upiTransactionId: { type: String, default: '' },

    // Cheque-specific
    chequeNo: { type: String, default: '' },
    chequeDate: { type: Date, default: null },
    chequeStatus: {
        type: String,
        enum: ['Cleared', 'Pending', 'Bounced'],
        default: 'Cleared',
    },

    // Payment status
    paymentStatus: {
        type: String,
        enum: ['Completed', 'Pending', 'Failed'],
        default: 'Completed',
    },

    notes: { type: String, default: '' },
    financialYear: { type: String, trim: true }, // e.g. "2025-2026"
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

paymentEntrySchema.index({ invoiceId: 1 });
paymentEntrySchema.index({ paymentDate: -1 });
paymentEntrySchema.index({ paymentMode: 1 });
paymentEntrySchema.index({ supplierId: 1 });
paymentEntrySchema.index({ financialYear: 1 });

const PaymentEntry = mongoose.model('PaymentEntry', paymentEntrySchema);
export { PaymentEntry };
