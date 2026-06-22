import mongoose from 'mongoose';
import { WHATSAPP_BULK_ATTACHMENT_TYPES, WHATSAPP_BULK_SEND_CONTENT_TYPES } from '../constants/whatsappBulk.constants.js';
import whatsappBulkAttachmentRefSchema from './whatsappBulkAttachmentRef.schema.js';

const whatsappBulkMatterSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        matterName: { type: String, required: true, trim: true },
        category: { type: String, trim: true, default: '' },
        industry: { type: String, trim: true, default: '' },
        language: { type: String, trim: true, default: 'en' },
        messageBody: { type: String, trim: true, default: '' },
        sendContentType: { type: String, enum: WHATSAPP_BULK_SEND_CONTENT_TYPES, default: 'text_only' },
        attachmentType: { type: String, enum: WHATSAPP_BULK_ATTACHMENT_TYPES, default: 'none' },
        attachmentPath: { type: String, trim: true, default: '' },
        attachmentOriginalName: { type: String, trim: true, default: '' },
        imageAttachment: { type: whatsappBulkAttachmentRefSchema, default: null },
        isActive: { type: Boolean, default: true },
        usageCount: { type: Number, default: 0 },
        lastUsedAt: { type: Date, default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

whatsappBulkMatterSchema.index({ companyId: 1, matterName: 1 });

const WhatsAppBulkMatter = mongoose.model('WhatsAppBulkMatter', whatsappBulkMatterSchema);
export default WhatsAppBulkMatter;
