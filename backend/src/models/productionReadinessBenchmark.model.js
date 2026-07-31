import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    certificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionReadinessCertification', required: true, index: true },
    targetAlias: { type: String, trim: true, default: 'localhost' },
    sampleSize: { type: Number, default: 0 },
    concurrency: { type: Number, default: 1 },
    durationSeconds: { type: Number, default: 0 },
    metrics: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    productionTargeted: { type: Boolean, default: false },
    sourceMutated: { type: Boolean, default: false },
    executedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'production_readiness_benchmarks' });

schema.index({ certificationId: 1, createdAt: -1 });

const ProductionReadinessBenchmark = mongoose.models.ProductionReadinessBenchmark
    || mongoose.model('ProductionReadinessBenchmark', schema);
export { ProductionReadinessBenchmark };
export default ProductionReadinessBenchmark;
