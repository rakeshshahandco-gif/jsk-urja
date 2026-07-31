import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    certificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionReadinessCertification', required: true, index: true },
    evidenceType: { type: String, trim: true, default: 'NOTE', index: true },
    title: { type: String, trim: true, required: true },
    summary: { type: String, trim: true, default: '' },
    storageReferenceAlias: { type: String, trim: true, default: '' },
    externalPathAlias: { type: String, trim: true, default: '' },
    checksum: { type: String, trim: true, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    containsSecrets: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'production_readiness_evidence' });

schema.index({ certificationId: 1, evidenceType: 1, createdAt: -1 });

const ProductionReadinessEvidence = mongoose.models.ProductionReadinessEvidence
    || mongoose.model('ProductionReadinessEvidence', schema);
export { ProductionReadinessEvidence };
export default ProductionReadinessEvidence;
