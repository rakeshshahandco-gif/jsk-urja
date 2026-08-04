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
    /** Bank / cash portion allocated to the bill */
    amount: { type: Number, required: true },
    /** Phase 1 — Discount Allowed (Receipt) / Discount Received (Payment) */
    discountAmount: { type: Number, default: 0 },
    discountLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
    discountReason: { type: String, default: '' },
    roundOff: { type: Number, default: 0 },
    remarks: { type: String, default: '' },
    settlementStatus: { type: String, default: '' },
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

    // Phase 1 — linked discount / round-off lines on Receipt/Payment
    lineRole: {
        type: String,
        enum: ['', 'BillAdjustmentDiscount', 'BillAdjustmentRoundOff'],
        default: '',
    },
    linkedBillRefId: { type: mongoose.Schema.Types.ObjectId, default: null },
    linkedBillRefNumber: { type: String, default: '' },

    // Cost / Profit Centre tagging on each voucher line
    costCenterId: { type: mongoose.Schema.Types.ObjectId, ref: 'CostCenter', default: null },
    costCenterName: { type: String, default: '' },
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

    /**
     * Phase 2B-B — RCM liability posting audit on Journal vouchers (no new collection).
     * Stored only on system-generated RCM liability / reversal journals.
     */
    rcmLiabilityMeta: { type: mongoose.Schema.Types.Mixed, default: null },

    /** Expense TDS (194C etc.) — threshold + posting audit */
    tdsSection: { type: String, trim: true, default: '' },
    tdsAmount: { type: Number, default: 0, min: 0 },
    tdsThresholdBaseAmount: { type: Number, default: 0, min: 0 },
    tdsSupplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    tdsPayableLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
    tdsExpenseLineLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
    /**
     * Line-wise / multi-section TDS on one expense voucher.
     * Header tdsSection/tdsAmount remain totals (or primary) for backward-compatible reports.
     */
    tdsLines: [
        {
            expenseLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
            expenseLedgerName: { type: String, trim: true, default: '' },
            tdsNature: { type: String, trim: true, default: '' },
            natureKey: { type: String, trim: true, uppercase: true, default: '' },
            section: { type: String, trim: true, uppercase: true, default: '' },
            sectionDisplay: { type: String, trim: true, default: '' },
            section393Label: { type: String, trim: true, default: '' },
            rate: { type: Number, default: 0, min: 0 },
            tdsBase: { type: Number, default: 0, min: 0 },
            tdsAmount: { type: Number, default: 0, min: 0 },
            payableLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
            overrideReason: { type: String, trim: true, default: '' },
        },
    ],
    tdsUserConfirmed: { type: Boolean, default: false },
    tdsPopupSkipped: { type: Boolean, default: false },
    tdsDisabledReason: { type: String, trim: true, default: '' },

    /** TDS deposited against ITNS 281 challans (partial / full). */
    tdsChallanAllocations: [
        {
            challanId: { type: mongoose.Schema.Types.ObjectId, ref: 'TdsChallan', required: true },
            amount: { type: Number, required: true, min: 0 },
        },
    ],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    financialYear: { type: String, trim: true }, // e.g. "2025-2026"

    // Reversing Journal support
    isReversingJournal: { type: Boolean, default: false },
    reverseOnDate: { type: Date, default: null },   // auto-reverse on this date
    reversedVoucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', default: null }, // the reverse voucher created
    isReversed: { type: Boolean, default: false },
    originalVoucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', default: null }, // set on the reverse entry
}, { timestamps: true });

voucherSchema.index({ voucherNo: 1 });
voucherSchema.index({ date: -1 });
voucherSchema.index({ partyId: 1 });
voucherSchema.index({ status: 1 });
voucherSchema.index({ financialYear: 1, voucherType: 1, voucherNo: 1 }, { unique: true });
voucherSchema.index({ financialYear: 1 });

const Voucher = mongoose.model('Voucher', voucherSchema);
export { Voucher };
