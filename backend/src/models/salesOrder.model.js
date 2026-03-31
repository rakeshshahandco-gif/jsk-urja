import mongoose from 'mongoose';

const soItemSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    itemCode: { type: String, default: '' },
    itemName: { type: String, required: true },
    description: { type: String, default: '' },
    modelNo: { type: String, default: '' },
    additionalNotes: { type: String, default: '' },
    hsnCode: { type: String, default: '' },
    uom: { type: String, default: 'NOS' },
    qty: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
    amount: { type: Number, default: 0 },  // qty * rate
    // Per-item GST (for invoice use)
    gstRate: { type: Number, default: 18 },
    cgstRate: { type: Number, default: 0 },
    cgstAmount: { type: Number, default: 0 },
    sgstRate: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstRate: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
}, { _id: true });

const salesOrderSchema = new mongoose.Schema({
    soNumber: { type: String, unique: true, trim: true },
    seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvoiceSeries', default: null },
    soDate: { type: Date, required: true, default: Date.now },
    gstApplicable: { type: Boolean, default: true },

    // Customer
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, required: true },
    customerCode: { type: String, default: '' },
    billingAddress: { type: String, default: '' },
    shippingAddress: { type: String, default: '' },
    customerGstin: { type: String, default: '' },
    customerState: { type: String, default: '' },
    customerStateCode: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
    customerEmail: { type: String, default: '' },

    // Customer PO Reference
    customerPO: { type: String, default: '' },
    customerPODate: { type: Date, default: null },

    // Order Info
    orderCategory: { type: String, enum: ['Order', 'Sample', 'Replacement'], default: 'Order' },
    deliveryDate: { type: Date, default: null },
    stickerType: { type: String, default: '' },
    orderedBy: { type: String, default: '' },
    remarks: { type: String, default: '' },

    // Items
    items: [soItemSchema],

    // Totals
    totalQty: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    freightAmount: { type: Number, default: 0 },
    freightGstRate: { type: Number, default: 0 },
    totalTaxableAmount: { type: Number, default: 0 },
    totalCgst: { type: Number, default: 0 },
    totalSgst: { type: Number, default: 0 },
    totalIgst: { type: Number, default: 0 },
    totalGst: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    roundedTotal: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    amountInWords: { type: String, default: '' },

    // GST
    gstType: { type: String, enum: ['CGST / SGST', 'IGST', ''], default: '' },
    placeOfSupply: { type: String, default: '' },

    // Payment / Status
    paymentType: { type: String, enum: ['Cash', 'Credit'], default: 'Credit' },
    creditPeriod: { type: Number, default: 0 },
    status: { type: String, enum: ['Draft', 'Confirmed', 'Dispatched', 'Invoiced', 'Closed', 'Cancelled'], default: 'Draft' },

    // Linked docs
    productionSheetId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionSheet', default: null },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesInvoice', default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    financialYear: { type: String, trim: true }, // e.g. "2025-2026"

    // Soft Delete
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deleteReason: { type: String, default: '' },
}, { timestamps: true });

salesOrderSchema.index({ soNumber: 1 });
salesOrderSchema.index({ customerId: 1, soDate: -1 });
salesOrderSchema.index({ status: 1 });
salesOrderSchema.index({ isDeleted: 1 });
salesOrderSchema.index({ financialYear: 1 });

const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema);
export { SalesOrder };
