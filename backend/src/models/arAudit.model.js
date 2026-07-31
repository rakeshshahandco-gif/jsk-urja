import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    platformScoped: { type: Boolean, default: false },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    activationProgramId: { type: mongoose.Schema.Types.ObjectId, ref: 'ActivationReadinessProgram', default: null, index: true },
    beforeSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    afterSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    reason: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, default: '' },
    simulationOnly: { type: Boolean, default: true },
    manualDeploymentOnly: { type: Boolean, default: true },
    productionExecutionAllowed: { type: Boolean, default: false },
    deploymentExecuted: { type: Boolean, default: false },
    productionActivated: { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'ar_audits' });

schema.index({ companyId: 1, createdAt: -1 });

const ArAudit = mongoose.models.ArAudit || mongoose.model('ArAudit', schema);
export { ArAudit };
export default ArAudit;