import mongoose from 'mongoose';

const reworkMaterialIssueSchema = new mongoose.Schema({
    issueNo: { type: String, required: true, unique: true },
    date: { type: Date, required: true, default: Date.now },

    jobCardId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReworkJobCard', required: true },
    jobCardNo: { type: String, required: true },

    issuedBy: { type: String, required: true }, // tech/store
    notes: { type: String },
    stockEffect: { type: Boolean, default: false }, // Has this reduced inventory?

    components: [{
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        itemCode: { type: String, required: true },
        itemName: { type: String, required: true },
        qtyRequired: { type: Number, required: true, min: 1 },
        qtyIssued: { type: Number, required: true, min: 1 },
        uom: { type: String }
    }]
}, { timestamps: true });

export const ReworkMaterialIssue = mongoose.model('ReworkMaterialIssue', reworkMaterialIssueSchema);
