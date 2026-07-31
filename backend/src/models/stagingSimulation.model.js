import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    pilotProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'PilotProgram', required: true, index: true },
    releasePackageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReleasePackage', default: null },
    readinessCertificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionReadinessCertification', default: null },
    simulationCode: { type: String, trim: true, required: true },
    title: { type: String, trim: true, required: true },
    plannedEnvironment: { type: String, default: 'STAGING_SIMULATION' },
    categories: { type: [String], default: [] },
    checklist: { type: [mongoose.Schema.Types.Mixed], default: [] },
    expectedResult: { type: String, trim: true, default: '' },
    actualLocalResult: { type: mongoose.Schema.Types.Mixed, default: null },
    issuesFound: { type: [mongoose.Schema.Types.Mixed], default: [] },
    riskResult: { type: String, default: 'UNKNOWN' },
    readinessRecommendation: { type: String, default: 'PENDING' },
    status: { type: String, default: 'DRAFT', index: true },
    simulationOnly: { type: Boolean, default: true },
    deploymentExecuted: { type: Boolean, default: false },
    productionActivated: { type: Boolean, default: false },
    productionTargeted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'staging_simulations' });

schema.index({ pilotProgramId: 1, createdAt: -1 });

const StagingSimulation = mongoose.models.StagingSimulation || mongoose.model('StagingSimulation', schema);
export { StagingSimulation };
export default StagingSimulation;
