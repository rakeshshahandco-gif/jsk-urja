import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    pilotProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'PilotProgram', required: true, index: true },
    uatPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'UatPlan', required: true, index: true },
    cycleName: { type: String, trim: true, required: true },
    cycleType: { type: String, enum: ['UAT_CYCLE_1', 'REMEDIATION', 'UAT_CYCLE_2', 'REGRESSION', 'FINAL_UAT_REVIEW'], default: 'UAT_CYCLE_1' },
    plannedStart: { type: Date, default: null },
    plannedEnd: { type: Date, default: null },
    actualStart: { type: Date, default: null },
    actualEnd: { type: Date, default: null },
    assignedTesters: { type: [mongoose.Schema.Types.Mixed], default: [] },
    testCaseIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    passCount: { type: Number, default: 0 },
    failCount: { type: Number, default: 0 },
    blockedCount: { type: Number, default: 0 },
    notRunCount: { type: Number, default: 0 },
    deferredCount: { type: Number, default: 0 },
    defectCount: { type: Number, default: 0 },
    criticalBlockers: { type: Number, default: 0 },
    evidenceCompleteness: { type: Number, default: 0 },
    reviewerStatus: { type: String, default: 'PENDING' },
    recommendation: { type: String, default: 'PENDING' },
    status: { type: String, default: 'PLANNED', index: true },
    simulationOnly: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'uat_cycles' });

schema.index({ uatPlanId: 1, cycleName: 1 });

const UatCycle = mongoose.models.UatCycle || mongoose.model('UatCycle', schema);
export { UatCycle };
export default UatCycle;
