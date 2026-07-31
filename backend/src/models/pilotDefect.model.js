import mongoose from 'mongoose';

export const DEFECT_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
export const DEFECT_STATUSES = [
    'NEW', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'FIX_READY_FOR_RETEST',
    'RETEST_FAILED', 'RETEST_PASSED', 'DEFERRED', 'ACCEPTED_RISK', 'REJECTED', 'CLOSED',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    pilotProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'PilotProgram', required: true, index: true },
    uatCycleId: { type: mongoose.Schema.Types.ObjectId, ref: 'UatCycle', default: null, index: true },
    executionId: { type: mongoose.Schema.Types.ObjectId, ref: 'UatExecution', default: null },
    defectCode: { type: String, trim: true, required: true },
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: '' },
    industry: { type: String, trim: true, default: '' },
    module: { type: String, trim: true, default: '', index: true },
    feature: { type: String, trim: true, default: '' },
    severity: { type: String, enum: DEFECT_SEVERITIES, default: 'MEDIUM', index: true },
    priority: { type: String, enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], default: 'MEDIUM', index: true },
    category: { type: String, trim: true, default: 'Functional' },
    reproducibility: { type: String, default: 'ALWAYS' },
    stepsToReproduce: { type: [String], default: [] },
    expected: { type: String, trim: true, default: '' },
    actual: { type: String, trim: true, default: '' },
    evidenceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    assignedOwnerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: DEFECT_STATUSES, default: 'NEW', index: true },
    rootCause: { type: String, trim: true, default: '' },
    proposedRemediation: { type: String, trim: true, default: '' },
    fixedVersion: { type: String, trim: true, default: '' },
    retestStatus: { type: String, default: 'PENDING' },
    acceptedRiskReason: { type: String, trim: true, default: '' },
    acceptedRiskExpiry: { type: Date, default: null },
    platformLevel: { type: Boolean, default: false },
    history: { type: [mongoose.Schema.Types.Mixed], default: [] },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    closureNote: { type: String, trim: true, default: '' },
    simulationOnly: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'pilot_defects' });

schema.index({ pilotProgramId: 1, severity: 1, status: 1 });
schema.index({ companyId: 1, defectCode: 1 });

const PilotDefect = mongoose.models.PilotDefect || mongoose.model('PilotDefect', schema);
export { PilotDefect };
export default PilotDefect;
