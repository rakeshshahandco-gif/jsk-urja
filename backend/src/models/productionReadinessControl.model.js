import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    platformScoped: { type: Boolean, default: true, index: true },
    controlCode: { type: String, trim: true, required: true, index: true },
    domain: { type: String, trim: true, required: true, index: true },
    title: { type: String, trim: true, required: true },
    objective: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    severityIfFailed: { type: String, enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'], default: 'HIGH' },
    automatedOrManual: { type: String, enum: ['AUTOMATED', 'MANUAL', 'HYBRID'], default: 'AUTOMATED' },
    testMethod: { type: String, trim: true, default: '' },
    evidenceRequired: { type: [String], default: [] },
    remediationGuidance: { type: String, trim: true, default: '' },
    applicableModules: { type: [String], default: [] },
    applicableEnvironments: { type: [String], default: [] },
    companyScoped: { type: Boolean, default: true },
    industryScoped: { type: Boolean, default: false },
    mandatory: { type: Boolean, default: true },
    version: { type: String, default: '1.0.0' },
    active: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'production_readiness_controls' });

schema.index({ controlCode: 1, version: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

const ProductionReadinessControl = mongoose.models.ProductionReadinessControl
    || mongoose.model('ProductionReadinessControl', schema);
export { ProductionReadinessControl };
export default ProductionReadinessControl;
