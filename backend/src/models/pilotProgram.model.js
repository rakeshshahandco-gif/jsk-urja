import mongoose from 'mongoose';

export const PILOT_STATUSES = [
    'DRAFT', 'PLANNING', 'PENDING_REVIEW', 'READY_FOR_STAGING_SIMULATION',
    'STAGING_SIMULATION_IN_PROGRESS', 'STAGING_SIMULATION_COMPLETED',
    'READY_FOR_PILOT_REVIEW', 'PILOT_APPROVED_FOR_LOCAL_SIMULATION',
    'PILOT_SIMULATION_IN_PROGRESS', 'PILOT_SIMULATION_PAUSED', 'PILOT_SIMULATION_SUSPENDED',
    'PILOT_SIMULATION_COMPLETED', 'UAT_IN_PROGRESS', 'UAT_BLOCKED', 'UAT_COMPLETED',
    'PILOT_EXTENSION_RECOMMENDED', 'PILOT_CLOSURE_RECOMMENDED', 'READY_FOR_PHASE_26_REVIEW',
    'REJECTED', 'ARCHIVED',
];

export const ALLOWED_ENVIRONMENTS = ['LOCAL', 'DEVELOPMENT', 'TESTING', 'STAGING_SIMULATION'];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    platformScoped: { type: Boolean, default: false, index: true },
    pilotCode: { type: String, trim: true, required: true },
    pilotName: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: '' },
    releasePackageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReleasePackage', required: true, index: true },
    readinessCertificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionReadinessCertification', required: true, index: true },
    programType: { type: String, trim: true, default: 'CONTROLLED_PILOT' },
    environmentType: { type: String, enum: ALLOWED_ENVIRONMENTS, default: 'STAGING_SIMULATION', index: true },
    startDatePlanned: { type: Date, default: null },
    endDatePlanned: { type: Date, default: null },
    pilotDurationDays: { type: Number, default: 14 },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    companySelectionMode: { type: String, default: 'SELECTED_COMPANIES' },
    industrySelectionMode: { type: String, default: 'SELECTED_INDUSTRIES' },
    userSelectionMode: { type: String, default: 'SELECTED_COHORTS' },
    rolloutStrategy: { type: String, default: 'INTERNAL_THEN_SELECTED' },
    riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
    uatRequired: { type: Boolean, default: true },
    rollbackPlanRequired: { type: Boolean, default: true },
    monitoringRequired: { type: Boolean, default: true },
    dataMigrationRequired: { type: Boolean, default: false },
    dataMigrationAllowed: { type: Boolean, default: false },
    externalIntegrationRequired: { type: Boolean, default: false },
    externalIntegrationAllowed: { type: Boolean, default: false },
    industryScope: { type: [String], default: [] },
    modulePlans: { type: [mongoose.Schema.Types.Mixed], default: [] },
    featureFlagPlans: { type: [mongoose.Schema.Types.Mixed], default: [] },
    successCriteria: { type: [mongoose.Schema.Types.Mixed], default: [] },
    failureCriteria: { type: [mongoose.Schema.Types.Mixed], default: [] },
    recommendation: { type: String, default: 'PENDING' },
    recommendationReason: { type: String, trim: true, default: '' },
    status: { type: String, enum: PILOT_STATUSES, default: 'DRAFT', index: true },
    simulationOnly: { type: Boolean, default: true },
    productionExecutionAllowed: { type: Boolean, default: false },
    deploymentExecuted: { type: Boolean, default: false },
    productionActivated: { type: Boolean, default: false },
    checksum: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true, collection: 'pilot_programs' });

schema.index({ companyId: 1, pilotCode: 1 }, { unique: true, partialFilterExpression: { isDeleted: false, platformScoped: false } });
schema.index({ companyId: 1, status: 1, createdAt: -1 });

const PilotProgram = mongoose.models.PilotProgram || mongoose.model('PilotProgram', schema);
export { PilotProgram };
export default PilotProgram;
