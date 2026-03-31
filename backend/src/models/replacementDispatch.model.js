import mongoose from 'mongoose';

const rdItemSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    itemCode: { type: String, default: '' },
    itemName: { type: String, required: true },
    qty: { type: Number, required: true, min: 0 },
    uom: { type: String, default: 'NOS' },
    remark: { type: String, default: '' },
}, { _id: true });

const replacementDispatchSchema = new mongoose.Schema({
    doNo: { type: String, unique: true, trim: true },
    date: { type: Date, required: true, default: Date.now },

    // Links
    complaintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', required: true },
    complaintNo: { type: String, default: '' },

    // Customer
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, required: true },
    dispatchAddress: { type: String, default: '' },
    salesInvoiceNo: { type: String, default: '' },

    // Transport
    dispatchThrough: { type: String, default: '' },
    vehicleDetails: { type: String, default: '' },
    lrNo: { type: String, default: '' },

    // Line items
    items: [rdItemSchema],

    // Footer
    notes: { type: String, default: '' },
    preparedBy: { type: String, default: '' },
    approvedBy: { type: String, default: '' },

    status: { type: String, enum: ['Draft', 'Dispatched', 'Cancelled'], default: 'Dispatched' },
    stockReduced: { type: Boolean, default: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    financialYear: { type: String, trim: true }, // e.g. "2025-2026"
}, { timestamps: true });

replacementDispatchSchema.index({ doNo: 1 });
replacementDispatchSchema.index({ complaintId: 1 });
replacementDispatchSchema.index({ financialYear: 1 });

const ReplacementDispatch = mongoose.model('ReplacementDispatch', replacementDispatchSchema);
export { ReplacementDispatch };
