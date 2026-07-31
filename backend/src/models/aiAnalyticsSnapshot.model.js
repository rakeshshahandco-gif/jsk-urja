import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    dashboardType: { type: String, trim: true, default: 'executive', index: true },
    dateRange: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    filterFingerprint: { type: String, trim: true, default: '', index: true },
    metrics: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    dimensions: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    sourceRevisionFingerprint: { type: String, trim: true, default: '' },
    generatedAt: { type: Date, default: Date.now, index: true },
    dataThrough: { type: Date, default: null },
    status: { type: String, enum: ['READY', 'STALE', 'FAILED'], default: 'READY', index: true },
    version: { type: String, trim: true, default: 'analytics-snapshot-v1' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ai_analytics_snapshots' });

schema.index({ companyId: 1, dashboardType: 1, filterFingerprint: 1, generatedAt: -1 });

const AiAnalyticsSnapshot = mongoose.models.AiAnalyticsSnapshot || mongoose.model('AiAnalyticsSnapshot', schema);
export { AiAnalyticsSnapshot };
export default AiAnalyticsSnapshot;
