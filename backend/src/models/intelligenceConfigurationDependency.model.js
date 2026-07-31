import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    versionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntelligenceConfigurationVersion', required: true, index: true },
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntelligenceConfigurationFamily', required: true },
    dependsOnFamilyCode: { type: String, trim: true, required: true },
    dependsOnMinimumVersion: { type: Number, default: null },
    dependencyType: { type: String, trim: true, default: 'CONFIGURATION_FAMILY' },
    required: { type: Boolean, default: true },
    notes: { type: String, trim: true, default: '' },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'intelligence_configuration_dependencies' });

schema.index({ companyId: 1, versionId: 1 });

const IntelligenceConfigurationDependency = mongoose.models.IntelligenceConfigurationDependency
    || mongoose.model('IntelligenceConfigurationDependency', schema);
export { IntelligenceConfigurationDependency };
export default IntelligenceConfigurationDependency;
