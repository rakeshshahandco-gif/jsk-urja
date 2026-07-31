import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    certificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionReadinessCertification', required: true, index: true },
    reviewType: { type: String, trim: true, required: true, index: true },
    decision: { type: String, trim: true, required: true },
    comment: { type: String, trim: true, default: '' },
    conditions: { type: [String], default: [] },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'production_readiness_reviews' });

schema.index({ certificationId: 1, reviewType: 1, createdAt: -1 });

const ProductionReadinessReview = mongoose.models.ProductionReadinessReview
    || mongoose.model('ProductionReadinessReview', schema);
export { ProductionReadinessReview };
export default ProductionReadinessReview;
