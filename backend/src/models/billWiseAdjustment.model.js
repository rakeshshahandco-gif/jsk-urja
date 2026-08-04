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
    paymentNature: { type: String, enum: ['Receipt', 'Payment', 'Adjustment', 'Journal', 'Credit Note'], required: true },

    adjustmentType: {
        type: String,
        enum: ['Against Bill', 'Advance', 'On Account', 'New Reference', 'Opening Credit'],
        default: 'Against Bill',
    },

    // Phase 4A — settlement source (Credit Note). Target bill remains billDocumentId/Type.
    settlementSourceType: {
        type: String,
        enum: ['Bank', 'CreditDebitNote', ''],
        default: '',
    },
    settlementSourceId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    settlementSourceNumber: { type: String, default: '' },
    settlementSourceModel: { type: String, default: '' },
    availableBefore: { type: Number, default: null },
    availableAfter: { type: Number, default: null },
    sourceMode: { type: String, default: '' }, // Receipt | Adjustment | BillWisePage | CreditNoteFinalize
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    /** When CN was applied together with a bank Receipt/Adjustment voucher (audit + cancel link). */
    parentReceiptVoucherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Voucher',
        default: null,
        index: true,
    },

    adjustmentDate: { type: Date, default: Date.now },
    adjustedAmount: { type: Number, required: true, min: 0.01 },
    /** Bank / cash portion (excludes discount). Optional for legacy rows. */
    bankAmount: { type: Number, default: null },
    /** Discount Allowed / Received portion on this settlement. Optional for legacy rows. */
    discountAmount: { type: Number, default: 0 },
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
