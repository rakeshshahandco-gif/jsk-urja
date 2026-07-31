import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, trim: true, required: true },
    viewKey: { type: String, default: '' },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    sort: { type: mongoose.Schema.Types.Mixed, default: {} },
    simulationOnly: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ar_saved_views' });

const ArSavedView = mongoose.models.ArSavedView || mongoose.model('ArSavedView', schema);
export { ArSavedView };
export default ArSavedView;