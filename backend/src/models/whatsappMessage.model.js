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
            // 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker' |
            // 'unsupported' | 'placeholder' (sync stub created by syncChats)
            type: String,
            default: 'text',
        },
        // For media messages, the original filename (documents) or a generated
        // one (e.g. "image.jpg"). Used as the suggested filename on download.
        mediaFilename: {
            type: String,
            default: '',
        },
        // For media messages, the mime type reported by WhatsApp. Used to set
        // the Content-Type header when streaming the download.
        mediaMime: {
            type: String,
            default: '',
        },
        // Full raw Baileys message envelope ({ key, message, messageTimestamp,
        // ... }) — required input for Baileys' downloadMediaMessage(). Stored
        // ONLY for media-bearing messages so we can stream the bytes back to
        // the CRM later. Text-only messages do not need this and leave it
        // empty to keep the collection small.
        rawMessage: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        chatName: {
            // Optional human-readable chat title. For groups this is the
            // WhatsApp group subject; for 1:1 it stays the saved contact
            // name from WhatsApp (when available).
            type: String,
            default: '',
        },
        mobile: {
            // Normalized digits-only phone number for 1:1 chats — used to
            // join against the Customer collection. Empty for groups.
            type: String,
            default: '',
        },
        isContact: {
            // True when WhatsApp told us this jid is in the user's address
            // book (via the contacts.upsert event with a non-empty name).
            type: Boolean,
            default: false,
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
        /**
         * Authoritative WhatsApp-session unread for this chat (Baileys chats.upsert/update).
         * Stored on placeholder stubs; CRM badges prefer this over summing Mongo inbound rows.
         */
        sessionUnreadCount: {
            type: Number,
            default: null,
            min: 0,
        },
        // Local disk path (legacy) + optional S3 reference for NEW media
        relativeFilePath: { type: String, default: '' },
        storageProvider: { type: String, default: '' },
        objectKey: { type: String, default: '' },
        mediaSize: { type: Number, default: null },
        mediaChecksum: { type: String, default: '' },
        downloadStatus: { type: String, default: '' },
        conversationKey: { type: String, default: '' },
        resolvedMobile: { type: String, default: '' },
        remoteJid: { type: String, default: '' },
        lidJid: { type: String, default: '' },
        finalDisplayName: { type: String, default: '' },
        deliveryStatus: { type: String, default: '' },
        mediaMeta: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    {
        timestamps: true,
        // Opt out of the global tenantSchemaPlugin: a WhatsApp/Baileys session
        // is per-user (one physical phone), not per-company. Without this the
        // plugin auto-prepends $match: { companyId } to every aggregate() and
        // hides every message saved by socket listeners (no HTTP context →
        // companyId null), which would make the chat list show only the few
        // outbound messages sent via the HTTP controller.
        disableTenant: true,
    }
);

whatsappMessageSchema.index({ userId: 1, jid: 1, timestamp: -1 });
whatsappMessageSchema.index(
    { userId: 1, messageId: 1 },
    { unique: true, partialFilterExpression: { messageId: { $type: 'string' } } }
);

const WhatsAppMessage = mongoose.model('WhatsAppMessage', whatsappMessageSchema);

export default WhatsAppMessage;
