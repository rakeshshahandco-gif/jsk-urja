import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    operationsProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'OperationsProgram', default: null, index: true },
    windowCode: { type: String, trim: true, required: true },
    title: { type: String, trim: true, required: true },
    plannedStart: { type: Date, required: true, index: true },
    plannedEnd: { type: Date, required: true, index: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    expectedDurationMinutes: { type: Number, default: 60 },
    affectedModules: { type: [String], default: [] },
    affectedCompanies: { type: [mongoose.Schema.Types.Mixed], default: [] },
    affectedIndustries: { type: [String], default: [] },
    expectedDowntimeMinutes: { type: Number, default: 0 },
    expectedDegradation: { type: String, default: 'NONE' },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    backupVerificationRequired: { type: Boolean, default: true },
    rollbackPlanRequired: { type: Boolean, default: true },
    communicationRequired: { type: Boolean, default: true },
    conflictStatus: { type: String, default: 'NONE' },
    approvalStatus: { type: String, default: 'PENDING', index: true },
    readinessResult: { type: String, default: 'PENDING' },
    isChangeFreeze: { type: Boolean, default: false },
    isBlackout: { type: Boolean, default: false },
    simulationOnly: { type: Boolean, default: true },
    scheduledExecution: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ops_maintenance_windows' });

const OpsMaintenanceWindow = mongoose.models.OpsMaintenanceWindow || mongoose.model('OpsMaintenanceWindow', schema);
export { OpsMaintenanceWindow };
export default OpsMaintenanceWindow;