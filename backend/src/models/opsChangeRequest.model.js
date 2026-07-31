import mongoose from 'mongoose';

export const CHANGE_TYPES = [
    'STANDARD', 'NORMAL', 'EMERGENCY_PLANNING_ONLY', 'SECURITY', 'CONFIGURATION',
    'DATABASE_PLANNING', 'FEATURE_FLAG_PLANNING', 'MODULE_ALLOCATION_PLANNING',
    'DOCUMENTATION', 'MONITORING', 'INCIDENT_REMEDIATION',
];
export const CHANGE_STATUSES = [
    'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUIRED', 'APPROVED_AS_PLAN',
    'REJECTED', 'CANCELLED', 'READY_FOR_PHASE_27_REVIEW',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    operationsProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'OperationsProgram', default: null, index: true },
    changeCode: { type: String, trim: true, required: true },
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: '' },
    reason: { type: String, trim: true, default: '' },
    changeType: { type: String, enum: CHANGE_TYPES, default: 'NORMAL', index: true },
    businessImpact: { type: String, default: 'MEDIUM' },
    technicalImpact: { type: String, default: 'MEDIUM' },
    dataImpact: { type: String, default: 'NONE' },
    affectedModules: { type: [String], default: [] },
    affectedCompanies: { type: [mongoose.Schema.Types.Mixed], default: [] },
    affectedIndustries: { type: [String], default: [] },
    risk: { type: String, default: 'MEDIUM' },
    implementationPlan: { type: String, default: '' },
    validationPlan: { type: String, default: '' },
    rollbackPlan: { type: String, default: '' },
    communicationPlan: { type: String, default: '' },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    plannedWindowStart: { type: Date, default: null },
    plannedWindowEnd: { type: Date, default: null },
    linkedReleasePackageId: { type: mongoose.Schema.Types.ObjectId, default: null },
    linkedIncidentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: { type: String, enum: CHANGE_STATUSES, default: 'DRAFT', index: true },
    history: { type: [mongoose.Schema.Types.Mixed], default: [] },
    simulationOnly: { type: Boolean, default: true },
    deploymentExecuted: { type: Boolean, default: false },
    productionActivated: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ops_change_requests' });

schema.index({ companyId: 1, changeCode: 1 });

const OpsChangeRequest = mongoose.models.OpsChangeRequest || mongoose.model('OpsChangeRequest', schema);
export { OpsChangeRequest };
export default OpsChangeRequest;