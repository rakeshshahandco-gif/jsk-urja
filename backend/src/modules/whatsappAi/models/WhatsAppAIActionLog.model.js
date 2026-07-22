import mongoose from 'mongoose';
import {
    WHATSAPP_AI_ACTION_TYPES,
    WHATSAPP_AI_ACTOR_TYPES,
} from '../constants/whatsappAi.constants.js';

/**
 * Append-only audit log.
 * - No soft-delete (audit rows must remain visible).
 * - No update/delete service surface (see audit.service.js).
 * - Mixed fields hold compact summaries/refs only — never secrets, binaries, or full prompts.
 */
const whatsAppAIActionLogSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WhatsAppAIConversation',
            default: null,
        },
        messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppAIMessage', default: null },
        actionType: { type: String, enum: WHATSAPP_AI_ACTION_TYPES, required: true },
        actorType: { type: String, enum: WHATSAPP_AI_ACTOR_TYPES, default: 'user' },
        actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        actionSummary: { type: String, trim: true, default: '', maxlength: 500 },
        // Compact metadata only (ids, short codes). Do not store API keys, files, or full LLM payloads.
        structuredMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
        beforeState: { type: mongoose.Schema.Types.Mixed, default: null },
        afterState: { type: mongoose.Schema.Types.Mixed, default: null },
        success: { type: Boolean, default: true },
        errorCode: { type: String, trim: true, default: '', maxlength: 64 },
        errorSummary: { type: String, trim: true, default: '', maxlength: 500 },
        timestamp: { type: Date, default: Date.now },
    },
    { timestamps: false, collection: 'whatsapp_ai_action_logs' },
);

whatsAppAIActionLogSchema.index({ companyId: 1, timestamp: -1 }, { name: 'idx_company_timestamp' });
whatsAppAIActionLogSchema.index({ companyId: 1, actionType: 1, timestamp: -1 }, { name: 'idx_company_action_timestamp' });

const WhatsAppAIActionLog = mongoose.models.WhatsAppAIActionLog
    || mongoose.model('WhatsAppAIActionLog', whatsAppAIActionLogSchema);

export default WhatsAppAIActionLog;
