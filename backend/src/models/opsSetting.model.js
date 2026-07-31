import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    version: { type: String, default: '1.0.0' },
    simulationOnly: { type: Boolean, default: true },
    productionExecutionAllowed: { type: Boolean, default: false },
    deploymentEnabled: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'ops_settings' });

schema.index({ companyId: 1 }, { unique: true });

const OpsSetting = mongoose.models.OpsSetting || mongoose.model('OpsSetting', schema);
export { OpsSetting };
export default OpsSetting;