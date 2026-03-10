import mongoose from 'mongoose';

const frItemSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    itemCode: { type: String, default: '' },
    itemName: { type: String, required: true },
    uom: { type: String, default: 'NOS' },
    qtyExpected: { type: Number, default: 0 },
    qtyReceived: { type: Number, required: true, min: 0 },
    physicalCondition: { type: String, enum: ['Good Packing', 'Damaged Packing', 'No Packing', 'Partial Damage'], default: 'Good Packing' },
    remarks: { type: String, default: '' },
}, { _id: true });

const faultyReceiptSchema = new mongoose.Schema({
    receiptNo: { type: String, unique: true, trim: true },
    date: { type: Date, required: true, default: Date.now },

    // Links
    complaintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', required: true },
    complaintNo: { type: String, default: '' },
    replacementDoId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReplacementDispatch', default: null },
    doNo: { type: String, default: '' },

    // Customer
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, required: true },

    // Items
    items: [frItemSchema],

    // Footer
    overallRemarks: { type: String, default: '' },
    receivedBy: { type: String, default: '' },
    status: { type: String, enum: ['Partial', 'Complete'], default: 'Complete' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

faultyReceiptSchema.index({ receiptNo: 1 });
faultyReceiptSchema.index({ complaintId: 1 });

const FaultyReceipt = mongoose.model('FaultyReceipt', faultyReceiptSchema);
export { FaultyReceipt };
