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
    additionalNotes: { type: String, default: '' },
    componentCategory: { type: String, default: '' },
    bomRef: { type: String, default: '' },
    isRateEditable: { type: Boolean, default: true },
}, { _id: true });

const purchaseOrderSchema = new mongoose.Schema({
    poNumber: { type: String, unique: true, trim: true },
    seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvoiceSeries', default: null },
    sequenceNumber: { type: Number },
    poDate: { type: Date, required: true, default: Date.now },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierName: { type: String, default: '' },
    gstType: { type: String, /* enum: ['CGST / SGST', 'IGST', ''], */ default: '' },
    paymentTerms: { type: String, default: '' },
    expectedDeliveryDate: { type: Date, default: null },
    warehouse: { type: String, default: '' },
    status: {
        type: String,
        // enum: ['Draft', 'Ordered', 'Partially Received', 'Fully Received', 'Completed', 'Cancelled'],
        default: 'Draft',
    },
    remarks: { type: String, default: '' },
    supplierGstNumber: { type: String, default: '' },
    supplierAddress: { type: String, default: '' },
    supplierState: { type: String, default: '' },
    supplierStateCode: { type: String, default: '' },
    supplierContact: { type: String, default: '' },
    supplierPhone: { type: String, default: '' },
    supplierEmail: { type: String, default: '' },
    deliveryAddress: { type: String, default: '' },
    deliveryFacility: { type: String, default: '' },
    items: [poItemSchema],
    complaintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', default: null },
    complaintNo: { type: String, default: '' },

    // Transportation & Freight
    transporterName: { type: String, default: '' },
    vehicleNo: { type: String, default: '' },
    lrNumber: { type: String, default: '' },
    freightAmount: { type: Number, default: 0 },
    freightGstRate: { type: Number, default: 0 },

    // Totals
    subTotal: { type: Number, default: 0 },
    discountTotal: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    financialYear: { type: String, trim: true }, // e.g. "2025-2026"

    // Soft Delete Fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deleteReason: { type: String, default: '' },
}, { timestamps: true });

purchaseOrderSchema.index({ status: 1 });
purchaseOrderSchema.index({ supplierId: 1 });
purchaseOrderSchema.index({ isDeleted: 1 });
purchaseOrderSchema.index({ financialYear: 1 });

const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);
export { PurchaseOrder };
