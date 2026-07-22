import mongoose from 'mongoose';
import { softDeleteAuditFields } from './sharedFields.js';

const whatsAppAIHumanTakeoverSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WhatsAppAIConversation',
            required: true,
        },
        active: { type: Boolean, default: true },
        assignedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        takenOverBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        takeoverReason: { type: String, trim: true, default: '', maxlength: 500 },
        startedAt: { type: Date, default: Date.now },
        endedAt: { type: Date, default: null },
        returnedToAiBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        returnReason: { type: String, trim: true, default: '', maxlength: 500 },
        ...softDeleteAuditFields,
    },
    { timestamps: true, collection: 'whatsapp_ai_human_takeovers' },
);

whatsAppAIHumanTakeoverSchema.index(
    { companyId: 1, conversationId: 1, active: 1, isDeleted: 1 },
    { name: 'idx_company_conversation_active' },
);

const WhatsAppAIHumanTakeover = mongoose.models.WhatsAppAIHumanTakeover
    || mongoose.model('WhatsAppAIHumanTakeover', whatsAppAIHumanTakeoverSchema);

export default WhatsAppAIHumanTakeover;
