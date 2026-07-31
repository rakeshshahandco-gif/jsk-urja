import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    platformScoped: { type: Boolean, default: false },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    version: { type: String, default: '1.0.0' },
    simulationOnly: { type: Boolean, default: true },
    productionExecutionAllowed: { type: Boolean, default: false },
    deploymentEnabled: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'pilot_settings' });

schema.index({ companyId: 1, platformScoped: 1 }, { unique: true });

const PilotSetting = mongoose.models.PilotSetting || mongoose.model('PilotSetting', schema);
export { PilotSetting };
export default PilotSetting;
