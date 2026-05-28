import mongoose from 'mongoose';

const rfqItemSchema = new mongoose.Schema({
    srNo: { type: Number, default: 1 },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    itemCode: { type: String, default: '' },
    itemName: { type: String, required: true },
    makeBrand: { type: String, default: '' },
    specification: { type: String, default: '' },
    hsnCode: { type: String, default: '' },
    requiredQty: { type: Number, required: true, min: 0.01 },
    uom: { type: String, default: 'NOS' },
    expectedRate: { type: Number, default: 0 },
    lastPurchaseRate: { type: Number, default: 0 },
    currentStock: { type: Number, default: 0 },
    requiredDeliveryDate: { type: Date, default: null },
    remarks: { type: String, default: '' },
}, { _id: true });

const rfqSupplierSchema = new mongoose.Schema({
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierName: { type: String, default: '' },
    contactPerson: { type: String, default: '' },
    mobile: { type: String, default: '' },
    email: { type: String, default: '' },
    whatsApp: { type: String, default: '' },
    gstin: { type: String, default: '' },
    city: { type: String, default: '' },
    previousPurchaseNote: { type: String, default: '' },
}, { _id: true });

const lineSelectionSchema = new mongoose.Schema({
    rfqItemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierQuotation', required: true },
    selectedQty: { type: Number, required: true, min: 0.01 },
}, { _id: false });

const purchaseRfqSchema = new mongoose.Schema({
    rfqNumber: { type: String, required: true, trim: true },
    rfqDate: { type: Date, required: true, default: Date.now },
    requiredByDate: { type: Date, default: null },
    department: { type: String, default: '' },
    requestedBy: { type: String, default: '' },
    requestedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    requestedByPhone: { type: String, default: '' },
    requestedByEmail: { type: String, default: '' },
    priority: { type: String, enum: ['Normal', 'Urgent'], default: 'Normal' },
    status: {
        type: String,
        enum: ['Draft', 'Sent', 'Quotation Received', 'Compared', 'Converted to PO', 'Closed', 'Cancelled'],
        default: 'Draft',
    },
    remarks: { type: String, default: '' },
    items: [rfqItemSchema],
    suppliers: [rfqSupplierSchema],
    wholeSupplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    lineSelections: [lineSelectionSchema],
    recommendedSupplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    recommendationReason: { type: String, default: '' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    approvalRemarks: { type: String, default: '' },
    convertedPoIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' }],
    financialYear: { type: String, trim: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

purchaseRfqSchema.index({ rfqNumber: 1 });
purchaseRfqSchema.index({ status: 1 });
purchaseRfqSchema.index({ rfqDate: -1 });
purchaseRfqSchema.index({ companyId: 1, financialYear: 1 });

export const PurchaseRfq = mongoose.model('PurchaseRfq', purchaseRfqSchema);
