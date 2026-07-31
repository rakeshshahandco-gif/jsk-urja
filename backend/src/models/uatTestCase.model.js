import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    pilotProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'PilotProgram', default: null, index: true },
    testCaseCode: { type: String, trim: true, required: true },
    title: { type: String, trim: true, required: true },
    objective: { type: String, trim: true, default: '' },
    module: { type: String, trim: true, default: '', index: true },
    feature: { type: String, trim: true, default: '' },
    companyType: { type: String, trim: true, default: '' },
    industry: { type: String, trim: true, default: '', index: true },
    userRole: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: 'Regression', index: true },
    priority: { type: String, enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], default: 'MEDIUM', index: true },
    risk: { type: String, default: 'MEDIUM' },
    preconditions: { type: [String], default: [] },
    testDataRequirement: { type: String, trim: true, default: '' },
    steps: { type: [String], default: [] },
    expectedResult: { type: String, trim: true, default: '' },
    evidenceRequired: { type: Boolean, default: true },
    automationEligible: { type: Boolean, default: false },
    manualOnly: { type: Boolean, default: true },
    version: { type: Number, default: 1 },
    status: { type: String, default: 'ACTIVE', index: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    simulationOnly: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'uat_test_cases' });

schema.index({ companyId: 1, testCaseCode: 1, version: 1 });

const UatTestCase = mongoose.models.UatTestCase || mongoose.model('UatTestCase', schema);
export { UatTestCase };
export default UatTestCase;
