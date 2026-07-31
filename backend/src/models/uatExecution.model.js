import mongoose from 'mongoose';

export const UAT_RESULT_STATUSES = [
    'NOT_RUN', 'PASSED', 'FAILED', 'BLOCKED', 'DEFERRED', 'NOT_APPLICABLE',
    'RETEST_REQUIRED', 'RETEST_PASSED', 'RETEST_FAILED',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    pilotProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'PilotProgram', required: true, index: true },
    uatCycleId: { type: mongoose.Schema.Types.ObjectId, ref: 'UatCycle', required: true, index: true },
    testCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'UatTestCase', required: true, index: true },
    testerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    industry: { type: String, trim: true, default: '' },
    role: { type: String, trim: true, default: '' },
    executedAt: { type: Date, default: Date.now },
    testInput: { type: mongoose.Schema.Types.Mixed, default: null },
    expectedResult: { type: String, trim: true, default: '' },
    actualResult: { type: String, trim: true, default: '' },
    resultStatus: { type: String, enum: UAT_RESULT_STATUSES, default: 'NOT_RUN', index: true },
    evidenceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    defectIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    notes: { type: String, trim: true, default: '' },
    retestRequired: { type: Boolean, default: false },
    retestResult: { type: String, default: null },
    reviewerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewStatus: { type: String, default: 'PENDING' },
    history: { type: [mongoose.Schema.Types.Mixed], default: [] },
    simulationOnly: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'uat_executions' });

schema.index({ uatCycleId: 1, testCaseId: 1, createdAt: -1 });

const UatExecution = mongoose.models.UatExecution || mongoose.model('UatExecution', schema);
export { UatExecution };
export default UatExecution;
