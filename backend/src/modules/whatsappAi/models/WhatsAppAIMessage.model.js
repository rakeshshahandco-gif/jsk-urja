import mongoose from 'mongoose';
import { softDeleteAuditFields, attachmentMetaSchema } from './sharedFields.js';
import {
    WHATSAPP_AI_MESSAGE_DIRECTIONS,
    WHATSAPP_AI_SENDER_TYPES,
    WHATSAPP_AI_MESSAGE_TYPES,
    WHATSAPP_AI_DELIVERY_STATUSES,
    WHATSAPP_AI_PROCESSING_STATUSES,
} from '../constants/whatsappAi.constants.js';

const whatsAppAIMessageSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WhatsAppAIConversation',
            required: true,
        },
        providerMessageId: { type: String, trim: true, default: null, maxlength: 200 },
        mirroredWhatsAppMessageId: { type: mongoose.Schema.Types.ObjectId, default: null },
        direction: { type: String, enum: WHATSAPP_AI_MESSAGE_DIRECTIONS, required: true },
        senderType: { type: String, enum: WHATSAPP_AI_SENDER_TYPES, required: true },
        messageType: { type: String, enum: WHATSAPP_AI_MESSAGE_TYPES, default: 'text' },
        text: { type: String, default: '', maxlength: 10000 },
        attachmentReference: { type: String, trim: true, default: '', maxlength: 1000 },
        attachmentMetadata: { type: attachmentMetaSchema, default: () => ({}) },
        deliveryStatus: { type: String, enum: WHATSAPP_AI_DELIVERY_STATUSES, default: 'pending' },
        aiConfidence: { type: Number, default: null, min: 0, max: 100 },
        knowledgeReferences: [{ type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppAIKnowledge' }],
        productReferences: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProductCatalog' }],
        detectedIntent: { type: String, trim: true, default: '', maxlength: 120 },
        idempotencyKey: { type: String, trim: true, default: null, maxlength: 200 },
        processingStatus: { type: String, enum: WHATSAPP_AI_PROCESSING_STATUSES, default: 'received' },
        ...softDeleteAuditFields,
    },
    { timestamps: true, collection: 'whatsapp_ai_messages' },
);

whatsAppAIMessageSchema.index({ companyId: 1, conversationId: 1, createdAt: -1 }, { name: 'idx_company_conversation_created' });
whatsAppAIMessageSchema.index(
    { companyId: 1, providerMessageId: 1 },
    {
        unique: true,
        name: 'uniq_company_providerMessageId',
        partialFilterExpression: {
            providerMessageId: { $type: 'string', $gt: '' },
            isDeleted: false,
        },
    },
);
whatsAppAIMessageSchema.index(
    { companyId: 1, idempotencyKey: 1 },
    {
        unique: true,
        name: 'uniq_company_idempotencyKey',
        partialFilterExpression: {
            idempotencyKey: { $type: 'string', $gt: '' },
            isDeleted: false,
        },
    },
);

const WhatsAppAIMessage = mongoose.models.WhatsAppAIMessage
    || mongoose.model('WhatsAppAIMessage', whatsAppAIMessageSchema);

export default WhatsAppAIMessage;
