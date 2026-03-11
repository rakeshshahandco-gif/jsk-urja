import mongoose from 'mongoose';

const productionScrapSchema = new mongoose.Schema({
    scrapNo: { type: String, required: true, unique: true },
    date: { type: Date, required: true, default: Date.now },

    jobCardId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReworkJobCard' },
    jobCardNo: { type: String },
    failureId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionFailure' },

    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    itemCode: { type: String, required: true },
    itemName: { type: String, required: true },

    qtyScrap: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true },

    approvedBy: { type: String, required: true },
    notes: { type: String },

    stockMoved: { type: Boolean, default: false } // Moving from REPAIR -> SCRAP or FAILED -> SCRAP

}, { timestamps: true });

export const ProductionScrap = mongoose.model('ProductionScrap', productionScrapSchema);
