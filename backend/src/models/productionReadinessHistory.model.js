import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    certificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionReadinessCertification', required: true, index: true },
    action: { type: String, trim: true, required: true },
    previousStatus: { type: String, trim: true, default: '' },
    newStatus: { type: String, trim: true, default: '' },
    reason: { type: String, trim: true, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'production_readiness_history' });

schema.index({ certificationId: 1, createdAt: -1 });

const ProductionReadinessHistory = mongoose.models.ProductionReadinessHistory
    || mongoose.model('ProductionReadinessHistory', schema);
export { ProductionReadinessHistory };
export default ProductionReadinessHistory;
