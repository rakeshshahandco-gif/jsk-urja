import mongoose from 'mongoose';

export const ASSISTANT_MESSAGE_ROLES = ['user', 'assistant', 'system'];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiSalesAssistantSession', required: true, index: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ASSISTANT_MESSAGE_ROLES, required: true },
    content: { type: String, trim: true, default: '' },
    intent: { type: String, trim: true, default: '' },
    confidence: { type: Number, default: 0 },
    safetyClassification: { type: String, trim: true, default: 'SAFE_READ' },
    queryPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    answer: { type: mongoose.Schema.Types.Mixed, default: null },
    evidenceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    limitations: { type: [String], default: [] },
    navigationSuggestions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    clarificationRequired: { type: Boolean, default: false },
    providerMode: { type: String, trim: true, default: 'RULE_ONLY' },
    providerStatus: { type: String, trim: true, default: 'UNUSED' },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ai_sales_assistant_messages' });

schema.index({ companyId: 1, sessionId: 1, createdAt: 1 });
schema.index({ companyId: 1, ownerUserId: 1, createdAt: -1 });

const AiSalesAssistantMessage = mongoose.models.AiSalesAssistantMessage
    || mongoose.model('AiSalesAssistantMessage', schema);
export { AiSalesAssistantMessage };
export default AiSalesAssistantMessage;
