import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    operationsProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'OperationsProgram', required: true, index: true },
    planType: { type: String, enum: ['BACKUP_VERIFICATION', 'RESTORE_VERIFICATION', 'DISASTER_RECOVERY', 'BUSINESS_CONTINUITY', 'EMERGENCY_STOP'], required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    scope: { type: String, default: '' },
    rto: { type: String, default: '' },
    rpo: { type: String, default: '' },
    steps: { type: [mongoose.Schema.Types.Mixed], default: [] },
    validationChecklist: { type: [mongoose.Schema.Types.Mixed], default: [] },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, default: 'DRAFT', index: true },
    simulationOnly: { type: Boolean, default: true },
    backupExecuted: { type: Boolean, default: false },
    restoreExecuted: { type: Boolean, default: false },
    migrationExecuted: { type: Boolean, default: false },
    rollbackExecuted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ops_continuity_plans' });

const OpsContinuityPlan = mongoose.models.OpsContinuityPlan || mongoose.model('OpsContinuityPlan', schema);
export { OpsContinuityPlan };
export default OpsContinuityPlan;