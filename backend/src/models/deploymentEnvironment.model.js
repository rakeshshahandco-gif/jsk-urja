import mongoose from 'mongoose';

export const ENVIRONMENT_CODES = ['LOCALHOST', 'DEVELOPMENT', 'TESTING', 'STAGING', 'PRODUCTION'];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    platformScoped: { type: Boolean, default: false, index: true },
    environmentCode: { type: String, enum: ENVIRONMENT_CODES, required: true, index: true },
    environmentName: { type: String, trim: true, required: true },
    environmentType: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    frontendServiceReference: { type: String, trim: true, default: '' },
    backendServiceReference: { type: String, trim: true, default: '' },
    databaseReferenceAlias: { type: String, trim: true, default: '' },
    branchReference: { type: String, trim: true, default: '' },
    deploymentMethod: { type: String, trim: true, default: 'MANUAL_FUTURE' },
    healthCheckDefinition: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    backupRequired: { type: Boolean, default: true },
    rollbackRequired: { type: Boolean, default: true },
    approvalPolicy: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    protectedEnvironment: { type: Boolean, default: false },
    productionLike: { type: Boolean, default: false },
    allowedSourceEnvironment: { type: [String], default: [] },
    allowedTargetEnvironment: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true, collection: 'deployment_environments' });

schema.index({ companyId: 1, environmentCode: 1 }, { unique: true, partialFilterExpression: { isDeleted: false, platformScoped: false } });
schema.index({ platformScoped: 1, environmentCode: 1 }, { unique: true, partialFilterExpression: { isDeleted: false, platformScoped: true } });

const DeploymentEnvironment = mongoose.models.DeploymentEnvironment
    || mongoose.model('DeploymentEnvironment', schema);
export { DeploymentEnvironment };
export default DeploymentEnvironment;
