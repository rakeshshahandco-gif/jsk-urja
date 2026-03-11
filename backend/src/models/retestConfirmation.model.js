import mongoose from 'mongoose';

const retestConfirmationSchema = new mongoose.Schema({
    retestNo: { type: String, required: true, unique: true },
    date: { type: Date, required: true, default: Date.now },

    jobCardId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReworkJobCard', required: true },
    jobCardNo: { type: String, required: true },

    outputId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReworkOutput' }, // Ref to Output result

    qtyTested: { type: Number, required: true },
    qtyPassed: { type: Number, required: true, default: 0 },
    qtyFailed: { type: Number, default: 0 },

    qcApprovedBy: { type: String, required: true },
    remarks: { type: String },

    stockMoved: { type: Boolean, default: false } // True when stock passes REPAIR -> SALEABLE

}, { timestamps: true });

export const RetestConfirmation = mongoose.model('RetestConfirmation', retestConfirmationSchema);
