import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, trim: true, required: true },
    viewKey: { type: String, trim: true, default: '' },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    sort: { type: mongoose.Schema.Types.Mixed, default: {} },
    isShared: { type: Boolean, default: false },
    simulationOnly: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'pilot_saved_views' });

schema.index({ companyId: 1, userId: 1, name: 1 });

const PilotSavedView = mongoose.models.PilotSavedView || mongoose.model('PilotSavedView', schema);
export { PilotSavedView };
export default PilotSavedView;
