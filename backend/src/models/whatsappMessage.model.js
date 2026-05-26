import mongoose from 'mongoose';

/**
 * WhatsApp Message — per-user message log for inbound / outbound chats.
 *
 * Scope is the CRM user (the Baileys session owner). We deliberately do NOT
 * tenant-scope (companyId) because a single user's WhatsApp session is the
 * same physical phone regardless of which company they are working in.
 *
 * One document per Baileys message. Compound index on (userId, jid, timestamp)
 * powers the per-chat history query; sparse unique on (userId, messageId)
 * de-dupes when Baileys re-delivers the same event.
 */
const whatsappMessageSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        jid: {
            // e.g. "919920730373@s.whatsapp.net" (1:1) or "...@g.us" (group)
            type: String,
            required: true,
            index: true,
        },
        isGroup: {
            type: Boolean,
            default: false,
        },
        participant: {
            // for group messages: the JID of the actual sender
            type: String,
            default: null,
        },
        direction: {
            type: String,
            enum: ['in', 'out'],
            required: true,
        },
        fromMe: {
            type: Boolean,
            default: false,
        },
        messageId: {
            // Baileys message id; used to de-dupe upsert events
            type: String,
            default: null,
        },
        text: {
            type: String,
            default: '',
        },
        mediaType: {
            // 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'unsupported'
            type: String,
            default: 'text',
        },
        timestamp: {
            type: Date,
            required: true,
            index: true,
        },
        read: {
            type: Boolean,
            default: false,
            index: true,
        },
    },
    { timestamps: true }
);

whatsappMessageSchema.index({ userId: 1, jid: 1, timestamp: -1 });
whatsappMessageSchema.index(
    { userId: 1, messageId: 1 },
    { unique: true, partialFilterExpression: { messageId: { $type: 'string' } } }
);

const WhatsAppMessage = mongoose.model('WhatsAppMessage', whatsappMessageSchema);

export default WhatsAppMessage;
