import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    pilotProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'PilotProgram', required: true, index: true },
    plannedCompanyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    companyCode: { type: String, trim: true, default: '' },
    companyNameSnapshot: { type: String, trim: true, default: '' },
    industryTemplate: { type: String, trim: true, default: '', index: true },
    currentEnabledModulesSnapshot: { type: [String], default: [] },
    proposedPilotModules: { type: [String], default: [] },
    proposedPilotFeatures: { type: [String], default: [] },
    plannedPilotUsers: { type: [mongoose.Schema.Types.Mixed], default: [] },
    eligibilityStatus: { type: String, default: 'PENDING' },
    readinessConcerns: { type: [String], default: [] },
    riskLevel: { type: String, default: 'MEDIUM' },
    isolationVerified: { type: Boolean, default: false },
    approvalStatus: { type: String, default: 'PENDING', index: true },
    rejectionReason: { type: String, trim: true, default: '' },
    suspensionStatus: { type: String, default: 'NONE' },
    rollbackEligible: { type: Boolean, default: true },
    activationExecuted: { type: Boolean, default: false },
    simulationOnly: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'pilot_company_plans' });

schema.index({ pilotProgramId: 1, plannedCompanyId: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

const PilotCompanyPlan = mongoose.models.PilotCompanyPlan || mongoose.model('PilotCompanyPlan', schema);
export { PilotCompanyPlan };
export default PilotCompanyPlan;
