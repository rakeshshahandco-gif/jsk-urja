import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    action: { type: String, trim: true, default: '', index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    detail: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    exportFormat: { type: String, trim: true, default: '' },
    filterSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    rowCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, index: true },
}, { timestamps: false, collection: 'ai_analytics_audits' });

const AiAnalyticsAudit = mongoose.models.AiAnalyticsAudit || mongoose.model('AiAnalyticsAudit', schema);
export { AiAnalyticsAudit };
export default AiAnalyticsAudit;
