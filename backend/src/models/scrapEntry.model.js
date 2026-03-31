import mongoose from 'mongoose';

const scrapItemSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    itemCode: { type: String, default: '' },
    itemName: { type: String, required: true },
    uom: { type: String, default: 'NOS' },
    qty: { type: Number, required: true, min: 0 },
    reason: { type: String, default: '' },
}, { _id: true });

const scrapEntrySchema = new mongoose.Schema({
    scrapNo: { type: String, unique: true, trim: true },
    date: { type: Date, required: true, default: Date.now },

    // Links
    jobCardId: { type: mongoose.Schema.Types.ObjectId, ref: 'RepairJobCard', required: true },
    jobCardNo: { type: String, default: '' },
    complaintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', default: null },
    complaintNo: { type: String, default: '' },

    items: [scrapItemSchema],

    notes: { type: String, default: '' },
    approvedBy: { type: String, default: '' },
    stockMoved: { type: Boolean, default: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    financialYear: { type: String, trim: true }, // e.g. "2025-2026"
}, { timestamps: true });

scrapEntrySchema.index({ scrapNo: 1 });
scrapEntrySchema.index({ jobCardId: 1 });
scrapEntrySchema.index({ financialYear: 1 });

const ScrapEntry = mongoose.model('ScrapEntry', scrapEntrySchema);
export { ScrapEntry };
