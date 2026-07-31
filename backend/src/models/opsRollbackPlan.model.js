import mongoose from 'mongoose';

export const ROLLBACK_AUTH_STATUSES = [
    'DRAFT', 'UNDER_REVIEW', 'APPROVED_AS_PLAN', 'REJECTED', 'READY_FOR_PHASE_27_REVIEW',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    operationsProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'OperationsProgram', required: true, index: true },
    rollbackTrigger: { type: String, default: '' },
    decisionAuthority: { type: String, default: 'PLATFORM_ADMIN' },
    requiredApprovals: { type: [String], default: ['PLATFORM_ADMIN'] },
    affectedCompanies: { type: [mongoose.Schema.Types.Mixed], default: [] },
    affectedIndustries: { type: [String], default: [] },
    affectedModules: { type: [String], default: [] },
    dataImpact: { type: String, default: '' },
    expectedDurationHours: { type: Number, default: 4 },
    validationChecklist: { type: [mongoose.Schema.Types.Mixed], default: [] },
    communicationPlan: { type: String, default: '' },
    postRollbackChecks: { type: [String], default: [] },
    linkedReleaseVersion: { type: String, default: '' },
    targetRollbackVersion: { type: String, default: '' },
    decisionMatrix: { type: [mongoose.Schema.Types.Mixed], default: [] },
    status: { type: String, enum: ROLLBACK_AUTH_STATUSES, default: 'DRAFT', index: true },
    simulationOnly: { type: Boolean, default: true },
    rollbackExecuted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ops_rollback_plans' });

const OpsRollbackPlan = mongoose.models.OpsRollbackPlan || mongoose.model('OpsRollbackPlan', schema);
export { OpsRollbackPlan };
export default OpsRollbackPlan;