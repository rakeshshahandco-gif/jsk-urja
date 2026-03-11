import mongoose from 'mongoose';

const reworkOutputSchema = new mongoose.Schema({
    outputNo: { type: String, required: true, unique: true },
    date: { type: Date, required: true, default: Date.now },

    jobCardId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReworkJobCard', required: true },
    jobCardNo: { type: String, required: true },

    qtyReceived: { type: Number, required: true },
    qtyRepaired: { type: Number, required: true, default: 0 },
    qtyFailedAgain: { type: Number, default: 0 },
    qtyScrap: { type: Number, default: 0 },

    testedBy: { type: String },
    notes: { type: String }
}, { timestamps: true });

export const ReworkOutput = mongoose.model('ReworkOutput', reworkOutputSchema);
