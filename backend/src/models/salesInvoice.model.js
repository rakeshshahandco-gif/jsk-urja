import mongoose from 'mongoose';

const siItemSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    itemCode: { type: String, default: '' },
    itemName: { type: String, required: true },
    modelNo: { type: String, default: '' },
    additionalNotes: { type: String, default: '' },
    description: { type: String, default: '' },
    hsnCode: { type: String, default: '' },
    uom: { type: String, default: 'NOS' },
    qty: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
    uqc: { type: String, default: '' }, // GSTR-1 Table 12 requirement
    hsnSacId: { type: mongoose.Schema.Types.ObjectId, ref: 'HsnMaster' },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxableAmount: { type: Number, default: 0 },   // qty * rate - discount
    gstRate: { type: Number, default: 18 },
    cgstRate: { type: Number, default: 0 },
    cgstAmount: { type: Number, default: 0 },
    sgstRate: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstRate: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    cessRate: { type: Number, default: 0 },
    cessAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    saleType: { 
        type: String, 
        enum: ['MANUFACTURED_SALE', 'TRADING_SALE'], 
        default: 'MANUFACTURED_SALE' 
    },
}, { _id: true });

const salesInvoiceSchema = new mongoose.Schema({
    invoiceNumber: { type: String, required: true, unique: true, trim: true },
    seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvoiceSeries', default: null },
    invoiceDate: { type: Date, required: true, default: Date.now },

    // Reference
    soId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder', default: null },
    soNumber: { type: String, default: '' },

    // Dispatch / Order info
    orderType: { type: String, default: '' },
    dispatchThrough: { type: String, default: '' },
    paymentDueDate: { type: Date, default: null },
    buyerOrderNo: { type: String, default: '' },
    buyerOrderDate: { type: Date, default: null },

    // Customer / Buyer Info (snapshot)
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, required: true },
    billingAddress: { type: String, default: '' },
    billingState: { type: String, default: '' },
    billingStateCode: { type: String, default: '' },
    customerGstin: { type: String, default: '' },
    customerRegistrationType: { type: String, default: '' }, // Captured from Customer Master
    exportCountry: { type: String, default: '' }, // Captured from Customer Master
    customerPhone: { type: String, default: '' },
    shippingAddress: { type: String, default: '' },
    shippingCity: { type: String, default: '' },
    shippingState: { type: String, default: '' },
    shippingStateCode: { type: String, default: '' },
    shippingPostalCode: { type: String, default: '' },
    shippingCountry: { type: String, default: '' },
    shippingGstin: { type: String, default: '' },
    shippingPhone: { type: String, default: '' },

    // Seller (Our Company) Info
    sellerName: { type: String, default: 'JSK URJA' },
    sellerGstin: { type: String, default: '' },
    sellerAddress: { type: String, default: '' },
    sellerState: { type: String, default: '' },
    sellerStateCode: { type: String, default: '' },

    // GST
    gstType: { type: String, /* enum: ['CGST / SGST', 'IGST'], */ default: 'CGST / SGST' },
    gstApplicable: { type: Boolean, default: true },
    placeOfSupply: { type: String, default: '' },
    reverseCharge: { type: Boolean, default: false },
    invoiceType: { type: String, enum: ['Regular', 'SEZ', 'Deemed Export', ''], default: 'Regular' }, // GSTR-1 B2B
    ecommerceGstin: { type: String, default: '', trim: true }, // GSTR-1: E-Commerce GSTIN

    // Items
    items: [siItemSchema],

    // Totals
    totalQty: { type: Number, default: 0 },
    subTotal: { type: Number, default: 0 },
    totalDiscount: { type: Number, default: 0 },
    totalTaxableAmount: { type: Number, default: 0 },
    totalCgst: { type: Number, default: 0 },
    totalSgst: { type: Number, default: 0 },
    totalIgst: { type: Number, default: 0 },
    totalGst: { type: Number, default: 0 },
    totalCessAmount: { type: Number, default: 0 },

    // Freight
    freightAmount: { type: Number, default: 0 },
    freightGstRate: { type: Number, default: 0 },
    freightGstAmount: { type: Number, default: 0 },

    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    roundedTotal: { type: Number, default: 0 },
    amountInWords: { type: String, default: '' },

    // Payment
    paymentType: { type: String, /* enum: ['Cash', 'Credit'], */ default: 'Credit' },
    paymentStatus: { type: String, /* enum: ['Unpaid', 'Partially Paid', 'Paid', 'Cancelled'], */ default: 'Unpaid' },
    paidAmount: { type: Number, default: 0 },
    paymentTerms: { type: String, default: '' },

    // Payments log
    payments: [{
        paymentDate: { type: Date },
        amountPaid: { type: Number, default: 0 },
        paymentMode: { type: String, default: 'Cash' },
        reference: { type: String, default: '' },
        remarks: { type: String, default: '' },
        recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    }],

    status: { type: String, /* enum: ['Draft', 'Confirmed', 'Cancelled'], */ default: 'Draft' },
    remarks: { type: String, default: '' },
    
    // Parent Reference for Credit/Debit Notes
    originalInvoiceReference: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesInvoice', default: null },

    // Cancellation Fields
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelReason: { type: String, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    financialYear: { type: String, trim: true }, // e.g. "2025-2026"

    // New Serial Numbering Fields
    sequenceNumber: { type: Number, default: 0 },
    displayInvoiceNumber: { type: String, trim: true },
    numberLocked: { type: Boolean, default: false },
    issuedToCustomer: { type: Boolean, default: false },
    renumberHistory: [{
        oldNumber: String,
        newNumber: String,
        reason: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],

    // Soft Delete Fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deleteReason: { type: String, default: '' },
}, { timestamps: true });

salesInvoiceSchema.index({ invoiceNumber: 1 });
salesInvoiceSchema.index({ displayInvoiceNumber: 1 });
salesInvoiceSchema.index({ financialYear: 1, seriesId: 1, sequenceNumber: 1 });
salesInvoiceSchema.index({ customerId: 1, invoiceDate: -1 });
salesInvoiceSchema.index({ paymentStatus: 1 });
salesInvoiceSchema.index({ soId: 1 });
salesInvoiceSchema.index({ isDeleted: 1 });
salesInvoiceSchema.index({ financialYear: 1 });

const SalesInvoice = mongoose.model('SalesInvoice', salesInvoiceSchema);
export { SalesInvoice };
