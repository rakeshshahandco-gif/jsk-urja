import mongoose from 'mongoose';

const piItemSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    itemCode: { type: String, default: '' },
    itemName: { type: String, required: true },
    description: { type: String, default: '' },
    hsnCode: { type: String, default: '' },          // HSN / SAC code (mandatory for GST)
    uom: { type: String, default: 'NOS' },
    qty: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
    taxableAmount: { type: Number, default: 0 },     // qty * rate after discount
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    // GST – CGST+SGST for intra-state, IGST for inter-state
    gstRate: { type: Number, default: 18 },          // total GST %
    cgstRate: { type: Number, default: 0 },
    cgstAmount: { type: Number, default: 0 },
    sgstRate: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstRate: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },       // taxableAmount + all taxes
    
    // Consumable / Non-Stock Logic
    isConsumable: { type: Boolean, default: false },
    purchaseType: { 
        type: String, 
        enum: ['RAW_MATERIAL_PURCHASE', 'TRADING_PURCHASE', 'CONSUMABLE_PURCHASE'], 
        default: 'RAW_MATERIAL_PURCHASE' 
    },
    allocation: {
        type: { type: String, enum: ['General', 'Product', 'Sales Order', 'Work Order', 'Department'], default: 'General' },
        referenceId: { type: mongoose.Schema.Types.ObjectId, refPath: 'items.allocation.typeModel', default: null },
        referenceName: { type: String, default: '' },
        typeModel: { type: String, enum: ['Item', 'SalesOrder', 'WorkOrder', 'Department', null], default: null }
    }
}, { _id: true });

const purchaseInvoiceSchema = new mongoose.Schema({
    invoiceNumber: { type: String, required: true, trim: true },
    seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvoiceSeries', default: null },
    sequenceNumber: { type: Number },
    invoiceDate: { type: Date, required: true, default: Date.now },

    // Reference
    poId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    poNumber: { type: String, default: '' },
    grnId: { type: mongoose.Schema.Types.ObjectId, ref: 'GRN', default: null },
    grnNumber: { type: String, default: '' },
    poDate: { type: Date, default: null },

    // Supplier Info (snapshot at time of invoice)
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierName: { type: String, required: true },
    supplierGstin: { type: String, default: '' },
    supplierAddress: { type: String, default: '' },
    supplierState: { type: String, default: '' },
    supplierStateCode: { type: String, default: '' },
    supplierInvoiceNo: { type: String, default: '' },  // Supplier's own invoice ref

    // Buyer (Our Company) Info
    buyerName: { type: String, default: 'JSK URJA' },
    buyerGstin: { type: String, default: '' },
    buyerAddress: { type: String, default: '' },
    buyerState: { type: String, default: '' },
    buyerStateCode: { type: String, default: '' },

    // GST
    gstType: { type: String, /* enum: ['CGST / SGST', 'IGST'], */ default: 'CGST / SGST' },
    placeOfSupply: { type: String, default: '' },
    reverseCharge: { type: Boolean, default: false },
    irnNumber: { type: String, default: '' },

    // Flow type
    flowType: {
        type: String,
        // enum: ['PO→GRN→Invoice', 'PO→Direct Invoice', 'Direct GRN→Invoice', 'Direct Invoice'],
        default: 'Direct Invoice',
    },
    isDirectPurchase: { type: Boolean, default: false }, // true = stock hit on invoice  // e-invoicing IRN (optional)
    isConsumable: { type: Boolean, default: false }, // Header level toggle

    // Items
    items: [piItemSchema],

    // Totals
    subTotal: { type: Number, default: 0 },
    totalDiscount: { type: Number, default: 0 },
    totalTaxableAmount: { type: Number, default: 0 },
    totalCgst: { type: Number, default: 0 },
    totalSgst: { type: Number, default: 0 },
    totalIgst: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },

    // Transportation & Freight
    transporterName: { type: String, default: '' },
    vehicleNo: { type: String, default: '' },
    lrNumber: { type: String, default: '' },          // LR / Bilty Number
    freightAmount: { type: Number, default: 0 },      // Freight charges (taxable)
    freightGstRate: { type: Number, default: 0 },     // GST % on freight (0/5/12/18)
    freightCgstRate: { type: Number, default: 0 },
    freightCgstAmount: { type: Number, default: 0 },
    freightSgstRate: { type: Number, default: 0 },
    freightSgstAmount: { type: Number, default: 0 },
    freightIgstRate: { type: Number, default: 0 },
    freightIgstAmount: { type: Number, default: 0 },
    freightTotalGst: { type: Number, default: 0 },    // Total GST on freight

    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    amountInWords: { type: String, default: '' },

    // TDS (vendor ledger + engine) — bill posts net supplier + TDS payable; FY threshold uses tdsThresholdBaseAmount
    tdsSection: { type: String, default: '' },
    tdsAmount: { type: Number, default: 0 },
    tdsThresholdBaseAmount: { type: Number, default: 0 },
    tdsPayableLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountLedger', default: null },
    /** When true, PaymentEntry against this PI should not double-count FY threshold (see tdsThreshold.service applyPaymentToBalance) */
    tdsFYThresholdIncluded: { type: Boolean, default: false },
    tdsUserConfirmed: { type: Boolean, default: false },
    tdsPopupSkipped: { type: Boolean, default: false },
    tdsDisabledReason: { type: String, default: '' },

    // Payment
    paymentTerms: { type: String, default: '' },
    dueDate: { type: Date, default: null },
    paymentStatus: {
        type: String,
        // enum: ['Unpaid', 'Partially Paid', 'Paid', 'Cancelled'],
        default: 'Unpaid',
    },
    paidAmount: { type: Number, default: 0 },

    // Payments log
    payments: [{
        paymentDate: { type: Date },
        amountPaid: { type: Number, default: 0 },
        paymentMode: { type: String, default: 'Voucher' },
        reference: { type: String, default: '' },
        remarks: { type: String, default: '' },
        recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    }],

    status: { type: String, /* enum: ['Draft', 'Confirmed', 'Posted', 'Cancelled'], */ default: 'Draft' },
    remarks: { type: String, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    financialYear: { type: String, trim: true }, // e.g. "2025-2026"

    // Soft Delete Fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deleteReason: { type: String, default: '' },
}, { timestamps: true });

purchaseInvoiceSchema.index({ supplierId: 1, invoiceDate: -1 });
purchaseInvoiceSchema.index({ companyId: 1, invoiceNumber: 1 }, { unique: true });
purchaseInvoiceSchema.index({ paymentStatus: 1 });
purchaseInvoiceSchema.index({ isDeleted: 1 });
purchaseInvoiceSchema.index({ financialYear: 1 });

const PurchaseInvoice = mongoose.model('PurchaseInvoice', purchaseInvoiceSchema);
export { PurchaseInvoice };
