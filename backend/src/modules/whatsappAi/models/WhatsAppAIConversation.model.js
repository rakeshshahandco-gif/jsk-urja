import mongoose from 'mongoose';
import { softDeleteAuditFields } from './sharedFields.js';
import { WHATSAPP_AI_CONVERSATION_STATUSES } from '../constants/whatsappAi.constants.js';

const whatsAppAIConversationSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
        whatsappNumber: { type: String, trim: true, default: '', maxlength: 32 },
        normalizedMobile: { type: String, trim: true, default: '', maxlength: 20 },
        jid: { type: String, trim: true, default: '', maxlength: 128 },
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
        leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
        aiLeadDraftId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppAILeadDraft', default: null },
        assignedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        status: {
            type: String,
            enum: WHATSAPP_AI_CONVERSATION_STATUSES,
            default: 'new_message',
        },
        currentStep: { type: String, trim: true, default: 'new_message', maxlength: 64 },
        stateVersion: { type: Number, default: 0, min: 0 },
        preferredLanguage: { type: String, trim: true, default: 'en', maxlength: 16 },
        source: { type: String, trim: true, default: 'whatsapp_ai', maxlength: 64 },
        humanTakeoverActive: { type: Boolean, default: false },
        lastInboundAt: { type: Date, default: null },
        lastOutboundAt: { type: Date, default: null },
        lastMessageAt: { type: Date, default: null },
        unreadCount: { type: Number, default: 0, min: 0 },
        aiConfidence: { type: Number, default: null, min: 0, max: 100 },
        resolutionReason: { type: String, trim: true, default: '', maxlength: 500 },
        escalationReason: { type: String, trim: true, default: '', maxlength: 500 },
        ...softDeleteAuditFields,
    },
    { timestamps: true, collection: 'whatsapp_ai_conversations' },
);

whatsAppAIConversationSchema.index({ companyId: 1, normalizedMobile: 1, isDeleted: 1 }, { name: 'idx_company_mobile' });
whatsAppAIConversationSchema.index({ companyId: 1, status: 1, lastMessageAt: -1 }, { name: 'idx_company_status_lastmsg' });
whatsAppAIConversationSchema.index({ companyId: 1, assignedUserId: 1, humanTakeoverActive: 1, isDeleted: 1 }, { name: 'idx_company_assignee_takeover' });

const WhatsAppAIConversation = mongoose.models.WhatsAppAIConversation
    || mongoose.model('WhatsAppAIConversation', whatsAppAIConversationSchema);

export default WhatsAppAIConversation;
