import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    versionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntelligenceConfigurationVersion', required: true, index: true },
    status: { type: String, enum: ['COMPATIBLE', 'COMPATIBLE_WITH_WARNINGS', 'INCOMPATIBLE', 'UNKNOWN'], required: true },
    checks: { type: [mongoose.Schema.Types.Mixed], default: [] },
    warnings: { type: [mongoose.Schema.Types.Mixed], default: [] },
    blockers: { type: [mongoose.Schema.Types.Mixed], default: [] },
    checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'intelligence_configuration_compatibility' });

schema.index({ companyId: 1, versionId: 1, createdAt: -1 });

const IntelligenceConfigurationCompatibility = mongoose.models.IntelligenceConfigurationCompatibility
    || mongoose.model('IntelligenceConfigurationCompatibility', schema);
export { IntelligenceConfigurationCompatibility };
export default IntelligenceConfigurationCompatibility;
