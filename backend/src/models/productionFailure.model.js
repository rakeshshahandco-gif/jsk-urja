import mongoose from 'mongoose';

const productionFailureSchema = new mongoose.Schema({
    failureNo: { type: String, required: true, unique: true },
    date: { type: Date, required: true, default: Date.now },
    workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkOrder' }, // Optional, can be direct or independent
    workOrderNo: { type: String },
    bomId: { type: mongoose.Schema.Types.ObjectId, ref: 'BOM' },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    itemCode: { type: String, required: true },
    itemName: { type: String, required: true },
    batchNo: { type: String },

    stage: {
        type: String,
        // enum: ['PCB Assembly', 'Manual Assembly', 'Soldering', 'Testing', '1st QC', 'Final QC', 'Burn Test', 'Packing Inspection', 'Other'],
        required: true
    },

    qtyChecked: { type: Number, required: true, min: 0 },
    qtyFailed: { type: Number, required: true, min: 0 },
    qtyPassed: { type: Number, required: true, min: 0 },

    reason: {
        type: String,
        // enum: ['Not Working', 'Low Output', 'Flickering', 'Wrong CCT', 'Dimming Issue', 'Driver Failure', 'Solder Issue', 'Component Missing', 'Wrong Component Mounted', 'Short Circuit', 'Open Circuit', 'PCB Damage', 'Heating Issue', 'Cosmetic Defect', 'Label Issue', 'Packing Issue', 'Other'],
        required: true
    },
    detailedObservation: { type: String },
    reportedBy: { type: String, required: true },
    department: { type: String },
    priority: { type: String, /* enum: ['Low', 'Medium', 'High', 'Urgent'], */ default: 'Medium' },

    status: {
        type: String,
        // enum: ['Open', 'Sent for Rework', 'Under Repair', 'Waiting Components', 'Retest Pending', 'Passed After Rework', 'Partially Passed', 'Rejected', 'Closed'],
        default: 'Open'
    },

    // Tracking fields populated sequentially by later rework stages
    qtyRepaired: { type: Number, default: 0 },
    qtyPassedAfterRetest: { type: Number, default: 0 },
    qtyFailedAgain: { type: Number, default: 0 },
    qtyScrap: { type: Number, default: 0 }

}, { timestamps: true });

export const ProductionFailure = mongoose.model('ProductionFailure', productionFailureSchema);
