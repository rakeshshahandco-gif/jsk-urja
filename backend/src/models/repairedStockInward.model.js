import mongoose from 'mongoose';

const rsiItemSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    itemCode: { type: String, default: '' },
    itemName: { type: String, required: true },
    uom: { type: String, default: 'NOS' },
    qtyRepaired: { type: Number, required: true, min: 0 },
    qtyPassedQC: { type: Number, default: 0 },
    warehouse: { type: String, default: '' },
}, { _id: true });

const repairedStockInwardSchema = new mongoose.Schema({
    inwardNo: { type: String, unique: true, trim: true },
    date: { type: Date, required: true, default: Date.now },

    // Links
    jobCardId: { type: mongoose.Schema.Types.ObjectId, ref: 'RepairJobCard', required: true },
    jobCardNo: { type: String, default: '' },
    complaintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', default: null },
    complaintNo: { type: String, default: '' },

    items: [rsiItemSchema],

    notes: { type: String, default: '' },
    addedBy: { type: String, default: '' },
    stockAdded: { type: Boolean, default: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

repairedStockInwardSchema.index({ inwardNo: 1 });
repairedStockInwardSchema.index({ jobCardId: 1 });

const RepairedStockInward = mongoose.model('RepairedStockInward', repairedStockInwardSchema);
export { RepairedStockInward };
