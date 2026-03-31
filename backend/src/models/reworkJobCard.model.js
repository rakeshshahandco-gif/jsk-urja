import mongoose from 'mongoose';

const reworkJobCardSchema = new mongoose.Schema({
    jobCardNo: { type: String, required: true, unique: true },
    date: { type: Date, required: true, default: Date.now },

    failureId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionFailure', required: true },
    failureNo: { type: String, required: true },

    workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkOrder' },
    workOrderNo: { type: String },

    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    itemCode: { type: String, required: true },
    itemName: { type: String, required: true },

    qtyReceived: { type: Number, required: true },
    qtyRepaired: { type: Number, default: 0 },
    qtyNonRepairable: { type: Number, default: 0 },

    assignedTo: { type: String, required: true },
    reworkType: {
        type: String,
        enum: ['Component Replacement', 'Resoldering', 'Wiring Correction', 'PCB Repair', 'Programming / Firmware Reload', 'Mechanical Correction', 'Retesting Only', 'Other'],
        required: true
    },

    problemIdentified: { type: String },
    rootCause: { type: String },
    correctiveAction: { type: String },
    notes: { type: String },

    startDate: { type: Date },
    completionDate: { type: Date },

    status: {
        type: String,
        enum: ['Pending', 'In Progress', 'Awaiting Material', 'Repaired', 'Closed'],
        default: 'Pending'
    },

    financialYear: { type: String, trim: true }, // e.g. "2025-2026"

}, { timestamps: true });

reworkJobCardSchema.index({ jobCardNo: 1 });
reworkJobCardSchema.index({ status: 1 });
reworkJobCardSchema.index({ financialYear: 1 });

export const ReworkJobCard = mongoose.model('ReworkJobCard', reworkJobCardSchema);
