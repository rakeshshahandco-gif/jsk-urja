import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    releaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReleasePackage', required: true, index: true },
    status: { type: String, enum: ['PASS', 'PASS_WITH_WARNINGS', 'FAIL', 'INCONCLUSIVE'], required: true },
    checks: { type: [mongoose.Schema.Types.Mixed], default: [] },
    warnings: { type: [mongoose.Schema.Types.Mixed], default: [] },
    blockers: { type: [mongoose.Schema.Types.Mixed], default: [] },
    simulatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deploymentExecuted: { type: Boolean, default: false },
    gitCalled: { type: Boolean, default: false },
    renderCalled: { type: Boolean, default: false },
    serviceRestarted: { type: Boolean, default: false },
    mongodbSourceModified: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'release_simulations' });

schema.index({ releaseId: 1, createdAt: -1 });

const ReleaseSimulation = mongoose.models.ReleaseSimulation || mongoose.model('ReleaseSimulation', schema);
export { ReleaseSimulation };
export default ReleaseSimulation;
