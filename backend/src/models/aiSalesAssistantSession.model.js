import mongoose from 'mongoose';

export const ASSISTANT_SESSION_STATUSES = ['ACTIVE', 'ARCHIVED', 'CLEARED'];

const contextSchema = new mongoose.Schema({
    filters: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    lastIntent: { type: String, trim: true, default: '' },
    lastResultRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    selectedRecordRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    mode: { type: String, trim: true, default: 'HYBRID' },
}, { _id: false });

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, trim: true, default: 'New conversation' },
    status: { type: String, enum: ASSISTANT_SESSION_STATUSES, default: 'ACTIVE', index: true },
    mode: { type: String, enum: ['RULE_ONLY', 'TEMPLATE_ONLY', 'AI_ASSISTED', 'HYBRID'], default: 'HYBRID' },
    context: { type: contextSchema, default: () => ({}) },
    messageCount: { type: Number, default: 0 },
    lastAskedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, index: true },
}, { timestamps: true, collection: 'ai_sales_assistant_sessions' });

schema.index({ companyId: 1, ownerUserId: 1, status: 1, updatedAt: -1 });
schema.index({ companyId: 1, isDeleted: 1, updatedAt: -1 });

const AiSalesAssistantSession = mongoose.models.AiSalesAssistantSession
    || mongoose.model('AiSalesAssistantSession', schema);
export { AiSalesAssistantSession };
export default AiSalesAssistantSession;
