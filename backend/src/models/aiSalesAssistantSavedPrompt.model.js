import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, trim: true, required: true },
    promptText: { type: String, trim: true, required: true },
    scope: { type: String, enum: ['PERSONAL', 'SHARED'], default: 'PERSONAL', index: true },
    tags: { type: [String], default: [] },
    useCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ai_sales_assistant_saved_prompts' });

schema.index({ companyId: 1, scope: 1, ownerUserId: 1, title: 1 });
schema.index({ companyId: 1, isDeleted: 1, updatedAt: -1 });

const AiSalesAssistantSavedPrompt = mongoose.models.AiSalesAssistantSavedPrompt
    || mongoose.model('AiSalesAssistantSavedPrompt', schema);
export { AiSalesAssistantSavedPrompt };
export default AiSalesAssistantSavedPrompt;
