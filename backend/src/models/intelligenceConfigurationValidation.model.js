import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    versionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntelligenceConfigurationVersion', required: true, index: true },
    status: { type: String, enum: ['PASS', 'PASS_WITH_WARNINGS', 'FAIL'], required: true },
    errorItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
    warningItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
    validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    engineVersion: { type: String, trim: true, default: '' },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'intelligence_configuration_validations' });

schema.index({ companyId: 1, versionId: 1, createdAt: -1 });

const IntelligenceConfigurationValidation = mongoose.models.IntelligenceConfigurationValidation
    || mongoose.model('IntelligenceConfigurationValidation', schema);
export { IntelligenceConfigurationValidation };
export default IntelligenceConfigurationValidation;
