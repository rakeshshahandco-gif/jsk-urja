import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    certificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionReadinessCertification', required: true, index: true },
    domain: { type: String, trim: true, required: true, index: true },
    status: { type: String, enum: ['NOT_STARTED', 'IN_PROGRESS', 'PASS', 'PASS_WITH_CONDITIONS', 'FAIL', 'INCONCLUSIVE'], default: 'NOT_STARTED', index: true },
    summary: { type: String, trim: true, default: '' },
    checks: { type: [mongoose.Schema.Types.Mixed], default: [] },
    findingsCreated: { type: Number, default: 0 },
    evidenceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    executedLocallyOnly: { type: Boolean, default: true },
    productionTargeted: { type: Boolean, default: false },
    sourceMutated: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'production_readiness_assessments' });

schema.index({ certificationId: 1, domain: 1 });

const ProductionReadinessAssessment = mongoose.models.ProductionReadinessAssessment
    || mongoose.model('ProductionReadinessAssessment', schema);
export { ProductionReadinessAssessment };
export default ProductionReadinessAssessment;
