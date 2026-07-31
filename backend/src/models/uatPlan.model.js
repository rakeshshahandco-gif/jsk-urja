import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    pilotProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'PilotProgram', required: true, index: true },
    releasePackageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReleasePackage', default: null },
    readinessCertificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionReadinessCertification', default: null },
    uatPlanCode: { type: String, trim: true, required: true },
    title: { type: String, trim: true, required: true },
    businessObjective: { type: String, trim: true, default: '' },
    scope: { type: String, trim: true, default: '' },
    outOfScope: { type: String, trim: true, default: '' },
    participatingCompanies: { type: [mongoose.Schema.Types.Mixed], default: [] },
    industries: { type: [String], default: [] },
    modules: { type: [String], default: [] },
    features: { type: [String], default: [] },
    userCohorts: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    entryCriteria: { type: [mongoose.Schema.Types.Mixed], default: [] },
    exitCriteria: { type: [mongoose.Schema.Types.Mixed], default: [] },
    successCriteria: { type: [mongoose.Schema.Types.Mixed], default: [] },
    failureCriteria: { type: [mongoose.Schema.Types.Mixed], default: [] },
    blockerRules: { type: [String], default: [] },
    evidenceRequirements: { type: [String], default: [] },
    status: { type: String, default: 'DRAFT', index: true },
    recommendation: { type: String, default: 'PENDING' },
    simulationOnly: { type: Boolean, default: true },
    productionExecutionAllowed: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'uat_plans' });

schema.index({ pilotProgramId: 1, uatPlanCode: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

const UatPlan = mongoose.models.UatPlan || mongoose.model('UatPlan', schema);
export { UatPlan };
export default UatPlan;
