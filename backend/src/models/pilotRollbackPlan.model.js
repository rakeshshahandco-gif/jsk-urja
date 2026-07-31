import mongoose from 'mongoose';

export const ROLLBACK_READINESS = [
    'NOT_DEFINED', 'DRAFT', 'REVIEW_REQUIRED', 'READY_FOR_SIMULATION',
    'SIMULATION_PASSED', 'SIMULATION_FAILED', 'READY_FOR_PILOT_REVIEW',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    pilotProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'PilotProgram', required: true, index: true },
    rollbackTrigger: { type: String, trim: true, default: '' },
    rollbackOwnerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decisionAuthority: { type: String, default: 'PLATFORM_ADMIN' },
    affectedCompanies: { type: [mongoose.Schema.Types.Mixed], default: [] },
    affectedIndustries: { type: [String], default: [] },
    affectedModules: { type: [String], default: [] },
    affectedFeatures: { type: [String], default: [] },
    dataImpact: { type: String, default: '' },
    configurationImpact: { type: String, default: '' },
    estimatedDurationHours: { type: Number, default: 4 },
    recoveryPointObjective: { type: String, default: '' },
    recoveryTimeObjective: { type: String, default: '' },
    backupDependency: { type: Boolean, default: true },
    migrationDependency: { type: Boolean, default: false },
    validationChecklist: { type: [mongoose.Schema.Types.Mixed], default: [] },
    communicationPlan: { type: String, default: '' },
    postRollbackVerification: { type: [String], default: [] },
    evidenceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    simulationResult: { type: mongoose.Schema.Types.Mixed, default: null },
    readinessStatus: { type: String, enum: ROLLBACK_READINESS, default: 'DRAFT', index: true },
    readinessScore: { type: Number, default: 0 },
    simulationOnly: { type: Boolean, default: true },
    rollbackExecuted: { type: Boolean, default: false },
    productionRestored: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'pilot_rollback_plans' });

const PilotRollbackPlan = mongoose.models.PilotRollbackPlan || mongoose.model('PilotRollbackPlan', schema);
export { PilotRollbackPlan };
export default PilotRollbackPlan;
