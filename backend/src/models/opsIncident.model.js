import mongoose from 'mongoose';

export const INCIDENT_SEVERITIES = ['SEV1', 'SEV2', 'SEV3', 'SEV4', 'INFORMATIONAL'];
export const INCIDENT_STATUSES = [
    'DRAFT', 'SIMULATED', 'TRIAGED', 'ASSIGNED', 'UNDER_REVIEW',
    'RESOLUTION_PLAN_READY', 'CLOSED_AS_SIMULATION', 'ESCALATED_FOR_PHASE_27',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    operationsProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'OperationsProgram', default: null, index: true },
    incidentCode: { type: String, trim: true, required: true },
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: '' },
    affectedService: { type: String, default: 'data_extractor' },
    industry: { type: String, default: '' },
    impact: { type: String, default: 'MEDIUM' },
    severity: { type: String, enum: INCIDENT_SEVERITIES, default: 'SEV3', index: true },
    detectionSource: { type: String, default: 'LOCAL_SIMULATION' },
    detectedAt: { type: Date, default: Date.now },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    responders: { type: [mongoose.Schema.Types.Mixed], default: [] },
    timeline: { type: [mongoose.Schema.Types.Mixed], default: [] },
    evidenceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    containmentPlan: { type: String, default: '' },
    recoveryPlan: { type: String, default: '' },
    rollbackRecommendation: { type: String, default: '' },
    communicationPlan: { type: String, default: '' },
    rootCauseRequired: { type: Boolean, default: true },
    linkedProblemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: { type: String, enum: INCIDENT_STATUSES, default: 'DRAFT', index: true },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    simulationOnly: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ops_incidents' });

schema.index({ companyId: 1, severity: 1, status: 1 });

const OpsIncident = mongoose.models.OpsIncident || mongoose.model('OpsIncident', schema);
export { OpsIncident };
export default OpsIncident;