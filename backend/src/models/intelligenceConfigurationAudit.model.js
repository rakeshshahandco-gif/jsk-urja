import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    action: { type: String, trim: true, required: true, index: true },
    entityType: { type: String, trim: true, default: '' },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'intelligence_configuration_audits' });

schema.index({ companyId: 1, createdAt: -1 });

const IntelligenceConfigurationAudit = mongoose.models.IntelligenceConfigurationAudit
    || mongoose.model('IntelligenceConfigurationAudit', schema);
export { IntelligenceConfigurationAudit };
export default IntelligenceConfigurationAudit;
