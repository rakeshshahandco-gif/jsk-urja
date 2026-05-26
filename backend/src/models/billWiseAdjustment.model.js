import mongoose from 'mongoose';

const billWiseAdjustmentSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true },
    financialYear: { type: String, trim: true, index: true },

    ledgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', required: true, index: true },

    billDocumentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    billDocumentType: {
        type: String,
        enum: ['SalesInvoice', 'PurchaseInvoice', 'Voucher', 'CreditDebitNote'],
        required: true,
    },
    billNo: { type: String, default: '' },

    paymentVoucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', required: true, index: true },
    paymentVoucherType: { type: String, default: '' },
    paymentNo: { type: String, default: '' },
    paymentNature: { type: String, enum: ['Receipt', 'Payment', 'Adjustment', 'Journal'], required: true },

    adjustmentType: {
        type: String,
        enum: ['Against Bill', 'Advance', 'On Account', 'New Reference', 'Opening Credit'],
        default: 'Against Bill',
    },

    adjustmentDate: { type: Date, default: Date.now },
    adjustedAmount: { type: Number, required: true, min: 0.01 },
    remarks: { type: String, default: '' },

    voucherItemIndex: { type: Number, required: true },
    voucherAdjustmentSubId: { type: mongoose.Schema.Types.ObjectId, required: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    isReversed: { type: Boolean, default: false, index: true },
    reversedAt: { type: Date, default: null },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reversalReason: { type: String, default: '' },
}, { timestamps: true });

billWiseAdjustmentSchema.index({ companyId: 1, billDocumentId: 1, paymentVoucherId: 1, isReversed: 1 });
billWiseAdjustmentSchema.index(
    { paymentVoucherId: 1, voucherAdjustmentSubId: 1 },
    { partialFilterExpression: { isReversed: false } },
);

const BillWiseAdjustment = mongoose.model('BillWiseAdjustment', billWiseAdjustmentSchema);
export { BillWiseAdjustment };
