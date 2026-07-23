import mongoose from 'mongoose';
import { softDeleteAuditFields } from './sharedFields.js';
import {
    WHATSAPP_AI_REPLY_DRAFT_STATUSES,
    WHATSAPP_AI_INTENT_TYPES,
    WHATSAPP_AI_DEFAULT_PROCESSING_VERSION,
} from '../constants/whatsappAi.constants.js';

const safetyResultSchema = new mongoose.Schema(
    {
        ok: { type: Boolean, default: false },
        code: { type: String, trim: true, default: '', maxlength: 64 },
        reasons: { type: [String], default: [] },
    },
    { _id: false },
);

/**
 * Isolated AI reply draft (Phase 1B-2). Not a CRM lead draft.
 * generationMode remains deterministic_test until a provider adapter is wired.
 */
const whatsAppAIReplyDraftSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WhatsAppAIConversation',
            required: true,
        },
        sourceMessageId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WhatsAppAIMessage',
            required: true,
        },
        intent: {
            type: String,
            enum: WHATSAPP_AI_INTENT_TYPES,
            required: true,
        },
        intentReason: { type: String, trim: true, default: '', maxlength: 500 },
        confidence: { type: Number, default: 1, min: 0, max: 1 },
        detectedLanguage: { type: String, trim: true, default: 'en', maxlength: 16 },
        draftText: { type: String, default: '', maxlength: 4000 },
        status: {
            type: String,
            enum: WHATSAPP_AI_REPLY_DRAFT_STATUSES,
            default: 'pending_review',
        },
        generationMode: {
            type: String,
            trim: true,
            default: 'deterministic_test',
            maxlength: 64,
        },
        processingVersion: {
            type: String,
            trim: true,
            default: WHATSAPP_AI_DEFAULT_PROCESSING_VERSION,
            maxlength: 64,
        },
        safetyResult: { type: safetyResultSchema, default: () => ({ ok: true, code: '', reasons: [] }) },
        reviewNotes: {
            type: [{
                note: { type: String, trim: true, maxlength: 2000 },
                createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
                createdAt: { type: Date, default: Date.now },
            }],
            default: [],
        },
        reviewMeta: {
            type: {
                approvedAt: { type: Date, default: null },
                approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
                rejectedAt: { type: Date, default: null },
                rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
                rejectionReason: { type: String, trim: true, default: '', maxlength: 1000 },
                editedAt: { type: Date, default: null },
                editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
                regenerationRequestedAt: { type: Date, default: null },
                regenerationRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
                // Phase 1D: approval never sends WhatsApp
                outboundSent: { type: Boolean, default: false },
                readyForControlledSend: { type: Boolean, default: false },
            },
            default: () => ({}),
        },
        contextSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
        idempotencyKey: { type: String, trim: true, required: true, maxlength: 220 },
        processingStartedAt: { type: Date, default: null },
        processingCompletedAt: { type: Date, default: null },
        processingMs: { type: Number, default: null, min: 0 },
        ...softDeleteAuditFields,
    },
    { timestamps: true, collection: 'whatsapp_ai_reply_drafts' },
);

whatsAppAIReplyDraftSchema.index(
    { companyId: 1, sourceMessageId: 1, processingVersion: 1 },
    {
        unique: true,
        name: 'uniq_company_source_version',
        partialFilterExpression: {
            sourceMessageId: { $type: 'objectId' },
            processingVersion: { $type: 'string', $gt: '' },
            isDeleted: false,
        },
    },
);
whatsAppAIReplyDraftSchema.index(
    { companyId: 1, conversationId: 1, createdAt: -1 },
    { name: 'idx_company_conversation_created' },
);
whatsAppAIReplyDraftSchema.index(
    { companyId: 1, idempotencyKey: 1 },
    {
        unique: true,
        name: 'uniq_company_reply_idempotency',
        partialFilterExpression: {
            idempotencyKey: { $type: 'string', $gt: '' },
            isDeleted: false,
        },
    },
);

const WhatsAppAIReplyDraft = mongoose.models.WhatsAppAIReplyDraft
    || mongoose.model('WhatsAppAIReplyDraft', whatsAppAIReplyDraftSchema);

export default WhatsAppAIReplyDraft;
