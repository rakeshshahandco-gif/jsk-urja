import mongoose from 'mongoose';

const quotationItemSchema = new mongoose.Schema({
    rfqItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    itemCode: { type: String, default: '' },
    itemDescription: { type: String, default: '' },
    requiredQty: { type: Number, default: 0 },
    quotedQty: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    taxPercent: { type: Number, default: 0 },
    freightAllocation: { type: Number, default: 0 },
    netRate: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    deliveryDays: { type: Number, default: 0 },
    makeBrand: { type: String, default: '' },
    supplierRemarks: { type: String, default: '' },
}, { _id: true });

const supplierQuotationSchema = new mongoose.Schema({
    rfqId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseRfq', required: true },
    rfqNumber: { type: String, default: '' },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierName: { type: String, default: '' },
    quotationNo: { type: String, default: '' },
    quotationDate: { type: Date, default: Date.now },
    validTill: { type: Date, default: null },
    paymentTerms: { type: String, default: '' },
    deliveryTime: { type: String, default: '' },
    freightPackingForwarding: { type: Number, default: 0 },
    gstExtraInclusive: { type: String, enum: ['Extra', 'Inclusive', ''], default: 'Extra' },
    warranty: { type: String, default: '' },
    remarks: { type: String, default: '' },
    attachmentName: { type: String, default: '' },
    attachmentPath: { type: String, default: '' },
    items: [quotationItemSchema],
    status: {
        type: String,
        enum: ['Pending', 'Received', 'Revised', 'Rejected', 'Selected', 'Converted to PO', 'Not Selected'],
        default: 'Pending',
    },
    convertedPoId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    convertedPoNumber: { type: String, default: '' },
    financialYear: { type: String, trim: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

supplierQuotationSchema.index({ rfqId: 1, supplierId: 1 });
supplierQuotationSchema.index({ status: 1 });
supplierQuotationSchema.index({ quotationDate: -1 });

export const SupplierQuotation = mongoose.model('SupplierQuotation', supplierQuotationSchema);
