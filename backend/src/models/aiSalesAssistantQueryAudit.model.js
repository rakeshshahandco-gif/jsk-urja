import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiSalesAssistantSession', default: null, index: true },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiSalesAssistantMessage', default: null },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    questionPreview: { type: String, trim: true, default: '' },
    intent: { type: String, trim: true, default: '' },
    safetyClassification: { type: String, trim: true, default: '' },
    toolsRequested: { type: [String], default: [] },
    toolsExecuted: { type: [String], default: [] },
    blocked: { type: Boolean, default: false },
    blockReason: { type: String, trim: true, default: '' },
    permissionsUsed: { type: [String], default: [] },
    resultCount: { type: Number, default: 0 },
    limitations: { type: [String], default: [] },
    durationMs: { type: Number, default: 0 },
    errorSanitized: { type: String, trim: true, default: '' },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ai_sales_assistant_query_audits' });

schema.index({ companyId: 1, createdAt: -1 });
schema.index({ companyId: 1, ownerUserId: 1, createdAt: -1 });

const AiSalesAssistantQueryAudit = mongoose.models.AiSalesAssistantQueryAudit
    || mongoose.model('AiSalesAssistantQueryAudit', schema);
export { AiSalesAssistantQueryAudit };
export default AiSalesAssistantQueryAudit;
