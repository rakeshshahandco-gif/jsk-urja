import mongoose from 'mongoose';

const assetMaintenanceSchema = new mongoose.Schema({
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'FixedAsset', required: true },
    entryDate: { type: Date, required: true, default: Date.now },
    problemReported: { type: String, trim: true },
    maintenanceType: {
        type: String,
        enum: ['Preventive', 'Breakdown', 'Service', 'Repair', 'Calibration'],
        default: 'Service'
    },
    vendor: { type: String, trim: true },
    cost: { type: Number, default: 0 },
    partsReplaced: { type: String, trim: true },
    startDate: { type: Date },
    completionDate: { type: Date },
    warrantyClaim: { type: Boolean, default: false },
    downtimeDays: { type: Number, default: 0 },
    attachmentUrl: { type: String, default: '' },
    status: {
        type: String,
        enum: ['Open', 'In Progress', 'Completed'],
        default: 'Open'
    },
    remarks: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const AssetMaintenance = mongoose.model('AssetMaintenance', assetMaintenanceSchema);
export { AssetMaintenance };
