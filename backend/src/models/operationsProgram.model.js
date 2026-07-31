import mongoose from 'mongoose';

export const OPS_STATUSES = [
    'DRAFT', 'PLANNING', 'PENDING_REVIEW', 'CHANGES_REQUIRED', 'HOLD', 'REJECTED',
    'READY_FOR_OPERATIONAL_REVIEW', 'READY_FOR_RELEASE_BOARD_REVIEW',
    'READY_FOR_MAINTENANCE_WINDOW_REVIEW', 'READY_FOR_PHASE_27_REVIEW', 'ARCHIVED',
];
export const ALLOWED_ENVIRONMENTS = ['LOCAL', 'DEVELOPMENT', 'TESTING', 'STAGING', 'PRODUCTION_PLANNING_ONLY'];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    platformScoped: { type: Boolean, default: false },
    programCode: { type: String, trim: true, required: true },
    programName: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: '' },
    releasePackageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReleasePackage', required: true, index: true },
    readinessCertificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionReadinessCertification', required: true, index: true },
    pilotProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'PilotProgram', required: true, index: true },
    pilotClosureId: { type: String, trim: true, default: '' },
    proposedEnvironment: { type: String, enum: ALLOWED_ENVIRONMENTS, default: 'PRODUCTION_PLANNING_ONLY', index: true },
    releaseVersion: { type: String, trim: true, default: '' },
    releaseType: { type: String, trim: true, default: 'FEATURE_RELEASE' },
    riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
    businessCriticality: { type: String, default: 'MEDIUM' },
    plannedWindowStart: { type: Date, default: null },
    plannedWindowEnd: { type: Date, default: null },
    expectedDurationHours: { type: Number, default: 4 },
    expectedDowntimeMinutes: { type: Number, default: 0 },
    expectedCustomerImpact: { type: String, default: 'LOW' },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    technicalOwnerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    businessOwnerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    productionControlPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    operationalChecklist: { type: [mongoose.Schema.Types.Mixed], default: [] },
    goLiveChecklist: { type: [mongoose.Schema.Types.Mixed], default: [] },
    monitoringPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    hypercarePlan: { type: mongoose.Schema.Types.Mixed, default: null },
    communicationPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    recommendation: { type: String, default: 'NOT_READY' },
    recommendationReason: { type: String, default: '' },
    status: { type: String, enum: OPS_STATUSES, default: 'DRAFT', index: true },
    simulationOnly: { type: Boolean, default: true },
    productionExecutionAllowed: { type: Boolean, default: false },
    deploymentExecuted: { type: Boolean, default: false },
    productionActivated: { type: Boolean, default: false },
    rollbackExecuted: { type: Boolean, default: false },
    backupExecuted: { type: Boolean, default: false },
    restoreExecuted: { type: Boolean, default: false },
    migrationExecuted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true, collection: 'operations_programs' });

schema.index({ companyId: 1, programCode: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
schema.index({ companyId: 1, status: 1, createdAt: -1 });

const OperationsProgram = mongoose.models.OperationsProgram || mongoose.model('OperationsProgram', schema);
export { OperationsProgram };
export default OperationsProgram;