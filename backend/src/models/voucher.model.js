import mongoose from 'mongoose';

const billAdjustmentSchema = new mongoose.Schema({
    adjustmentType: {
        type: String,
        enum: ['Against Bill', 'Advance', 'On Account', 'New Reference', 'Opening Credit'],
        default: 'Against Bill'
    },
    refId: { type: mongoose.Schema.Types.ObjectId, refPath: 'items.adjustments.refModel' },
    refModel: { type: String, /* enum: ['SalesInvoice', 'PurchaseInvoice'], */ default: 'SalesInvoice' },
    refNumber: { type: String, default: '' },
    amount: { type: Number, required: true },
});

const voucherItemSchema = new mongoose.Schema({
    ledgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', required: true },
    ledgerName: { type: String, default: '' },
    amount: { type: Number, required: true, min: 0.01 },
    type: { type: String, enum: ['Debit', 'Credit'], required: true },
    narration: { type: String, default: '' },
    
    // Line Level GST Fields
    hsnCode: { type: String, default: '' },
    gstRate: { type: Number, default: 0 },
    taxableAmount: { type: Number, default: 0 },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },

    adjustments: [billAdjustmentSchema],
});

const voucherSchema = new mongoose.Schema({
    voucherNo: { type: String, required: true },
    voucherType: { type: mongoose.Schema.Types.ObjectId, ref: 'VoucherType', required: true },
    voucherTypeName: { type: String, default: '' },
    nature: { type: String, /* enum: ['Receipt', 'Payment', 'Contra', 'Journal', 'Expense', 'Debit Note', 'Credit Note', 'Sales', 'Purchase'], */ required: true },
    date: { type: Date, required: true, default: Date.now },

    // Header Cash/Bank selection
    cashBankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashBankAccount' },
    cashBankAccountName: { type: String, default: '' },

    // For single-entry mode convenience
    partyId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger' },
    partyName: { type: String, default: '' },

    totalAmount: { type: Number, required: true, min: 0 },

    // Instrument details
    instrumentType: {
        type: String,
        // enum: ['Cash', 'Cheque', 'Bank Transfer', 'NEFT', 'RTGS', 'IMPS', 'UPI', 'Card', 'Other'],
        default: 'Cash'
    },
    instrumentNo: { type: String, default: '' },
    instrumentDate: { type: Date, default: null },
    bankReference: { type: String, default: '' }, // UTR etc.

    narration: { type: String, default: '' },
    status: { type: String, /* enum: ['Draft', 'Confirmed', 'Cancelled'], */ default: 'Confirmed' },

    // Expense Enhancement Fields
    expenseType: { 
        type: String, 
        enum: ['Cash', 'Bank', 'Credit', 'Petty Cash'],
        default: 'Cash'
    },
    supplierBillNo: { type: String, default: '' },
    supplierBillDate: { type: Date },
    dueDate: { type: Date },
    paymentStatus: {
        type: String,
        enum: ['Unpaid', 'Partially Paid', 'Paid', 'Cancelled'],
        default: 'Paid'
    },
    paidAmount: { type: Number, default: 0 },

    // Header Level GST Fields
    isGstEnabled: { type: Boolean, default: false },
    gstType: { type: String, enum: ['CGST / SGST', 'IGST'], default: 'CGST / SGST' },
    placeOfSupply: { type: String, default: '' },
    supplierGstin: { type: String, default: '' },
    totalTaxableAmount: { type: Number, default: 0 },
    totalCgst: { type: Number, default: 0 },
    totalSgst: { type: Number, default: 0 },
    totalIgst: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },

    items: [voucherItemSchema],

    isSystemGenerated: { type: Boolean, default: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    financialYear: { type: String, trim: true }, // e.g. "2025-2026"
}, { timestamps: true });

voucherSchema.index({ voucherNo: 1 });
voucherSchema.index({ date: -1 });
voucherSchema.index({ partyId: 1 });
voucherSchema.index({ status: 1 });
voucherSchema.index({ financialYear: 1, voucherType: 1, voucherNo: 1 }, { unique: true });
voucherSchema.index({ financialYear: 1 });

const Voucher = mongoose.model('Voucher', voucherSchema);
export { Voucher };
