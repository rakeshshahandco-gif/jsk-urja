import mongoose from 'mongoose';

const poItemSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    itemCode: { type: String, default: '' },
    itemName: { type: String, required: true },
    description: { type: String, default: '' },
    hsnCode: { type: String, default: '' },
    uom: { type: String, default: 'NOS' },
    orderedQty: { type: Number, required: true, min: 0.01 },
    receivedQty: { type: Number, default: 0 },   // Updated from GRNs or Direct Invoice
    invoicedQty: { type: Number, default: 0 },   // Updated when invoice is posted
    pendingQty: { type: Number, default: 0 },     // orderedQty - receivedQty
    rate: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    taxPercent: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    componentCategory: { type: String, default: '' },
    bomRef: { type: String, default: '' },
    isRateEditable: { type: Boolean, default: true },
}, { _id: true });

const purchaseOrderSchema = new mongoose.Schema({
    poNumber: { type: String, unique: true, trim: true },
    poDate: { type: Date, required: true, default: Date.now },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierName: { type: String, default: '' },
    gstType: { type: String, enum: ['CGST / SGST', 'IGST', ''], default: '' },
    paymentTerms: { type: String, default: '' },
    expectedDeliveryDate: { type: Date, default: null },
    warehouse: { type: String, default: '' },
    status: {
        type: String,
        enum: ['Draft', 'Ordered', 'Partially Received', 'Fully Received', 'Closed', 'Cancelled'],
        default: 'Draft',
    },
    remarks: { type: String, default: '' },
    items: [poItemSchema],

    // Totals
    subTotal: { type: Number, default: 0 },
    discountTotal: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

purchaseOrderSchema.index({ poNumber: 1 });
purchaseOrderSchema.index({ status: 1 });
purchaseOrderSchema.index({ supplierId: 1 });

const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);
export { PurchaseOrder };
