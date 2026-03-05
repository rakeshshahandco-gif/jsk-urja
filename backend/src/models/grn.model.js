import mongoose from 'mongoose';

const grnItemSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    poItemId: { type: mongoose.Schema.Types.ObjectId, default: null }, // null for Direct GRN
    itemCode: { type: String, default: '' },
    itemName: { type: String, required: true },
    description: { type: String, default: '' },
    hsnCode: { type: String, default: '' },
    uom: { type: String, default: 'NOS' },
    orderedQty: { type: Number, default: 0 },
    previouslyReceivedQty: { type: Number, default: 0 },
    pendingQty: { type: Number, default: 0 },
    receivedQty: { type: Number, required: true, min: 0.01 },
    invoicedQty: { type: Number, default: 0 },    // Tracked as invoices are posted
    rate: { type: Number, required: true, min: 0 },
    amount: { type: Number, default: 0 },
    qcStatus: { type: String, enum: ['Pending', 'Accepted', 'Rejected', 'Hold'], default: 'Accepted' },
    batchNo: { type: String, default: '' },
    serialNo: { type: String, default: '' },
    remarks: { type: String, default: '' },
    discountPercent: { type: Number, default: 0 },
    taxPercent: { type: Number, default: 0 },
}, { _id: true });

const grnSchema = new mongoose.Schema({
    grnNumber: { type: String, unique: true, trim: true },
    grnDate: { type: Date, required: true, default: Date.now },

    // PO reference is optional (Flow C: Direct GRN without PO)
    poId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    poNumber: { type: String, default: '' },

    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierName: { type: String, default: '' },
    warehouse: { type: String, default: '' },
    supplierGstNumber: { type: String, default: '' },
    supplierAddress: { type: String, default: '' },
    gstType: { type: String, default: 'CGST / SGST' },
    transporterName: { type: String, default: '' },
    vehicleNo: { type: String, default: '' },
    lrNumber: { type: String, default: '' },
    freightAmount: { type: Number, default: 0 },
    freightGstRate: { type: Number, default: 0 },

    // Source type
    sourceType: {
        type: String,
        enum: ['Against PO', 'Direct GRN'],
        default: 'Against PO',
    },

    status: { type: String, enum: ['Draft', 'Confirmed', 'QC Hold'], default: 'Confirmed' },

    // Invoice tracking at GRN level
    invoiceStatus: {
        type: String,
        enum: ['Open', 'Partially Invoiced', 'Fully Invoiced'],
        default: 'Open',
    },

    items: [grnItemSchema],
    totalAmount: { type: Number, default: 0 },
    remarks: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

grnSchema.index({ poId: 1 });
grnSchema.index({ supplierId: 1 });
grnSchema.index({ grnNumber: 1 });
grnSchema.index({ invoiceStatus: 1 });

const GRN = mongoose.model('GRN', grnSchema);
export { GRN };
