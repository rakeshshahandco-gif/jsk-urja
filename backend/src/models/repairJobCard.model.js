import mongoose from 'mongoose';

const jcItemSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    itemCode: { type: String, default: '' },
    itemName: { type: String, required: true },
    uom: { type: String, default: 'NOS' },
    qtyReceivedForRepair: { type: Number, default: 0 },
    faultDescription: { type: String, default: '' },
    rootCause: { type: String, default: '' },
    actionTaken: { type: String, default: '' },
    repairedQty: { type: Number, default: 0 },
    scrapQty: { type: Number, default: 0 },
    qcPassedQty: { type: Number, default: 0 },
    inwardedQty: { type: Number, default: 0 },
    actualScrappedQty: { type: Number, default: 0 },
    pendingQty: { type: Number, default: 0 },
    repairResult: {
        type: String,
        enum: ['Repaired', 'Not Repairable', 'Replaced Internally', 'Scrapped', 'Returned to Customer', 'Pending QC'],
        default: 'Pending QC',
    },
}, { _id: true });

const repairJobCardSchema = new mongoose.Schema({
    jobCardNo: { type: String, unique: true, trim: true },
    date: { type: Date, required: true, default: Date.now },

    // Links
    complaintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', required: true },
    complaintNo: { type: String, default: '' },
    faultyReceiptId: { type: mongoose.Schema.Types.ObjectId, ref: 'FaultyReceipt', default: null },
    receiptNo: { type: String, default: '' },

    // Assignment
    assignedTo: { type: String, default: '' },
    technicianName: { type: String, default: '' },

    status: {
        type: String,
        enum: ['Pending Inspection', 'Under Repair', 'Awaiting Parts', 'Repaired', 'Not Repairable', 'Closed'],
        default: 'Pending Inspection',
    },

    expectedCompletionDate: { type: Date, default: null },
    actualCompletionDate: { type: Date, default: null },

    // Line items
    items: [jcItemSchema],

    overallNotes: { type: String, default: '' },
    stockMovedToRepair: { type: Boolean, default: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    financialYear: { type: String, trim: true }, // e.g. "2025-2026"
}, { timestamps: true });

repairJobCardSchema.index({ jobCardNo: 1 });
repairJobCardSchema.index({ complaintId: 1 });
repairJobCardSchema.index({ status: 1 });
repairJobCardSchema.index({ financialYear: 1 });

const RepairJobCard = mongoose.model('RepairJobCard', repairJobCardSchema);
export { RepairJobCard };
