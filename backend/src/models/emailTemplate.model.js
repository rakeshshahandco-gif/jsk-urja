import mongoose from 'mongoose';
import { EMAIL_BULK_ATTACHMENT_TYPES, EMAIL_BULK_SEND_CONTENT_TYPES } from '../constants/emailBulk.constants.js';
import platformAttachmentRefSchema from './platformAttachmentRef.schema.js';

const emailTemplateSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        templateName: { type: String, required: true, trim: true },
        category: { type: String, trim: true, default: '' },
        subject: { type: String, trim: true, default: '' },
        bodyText: { type: String, trim: true, default: '' },
        bodyHtml: { type: String, trim: true, default: '' },
        sendContentType: { type: String, enum: EMAIL_BULK_SEND_CONTENT_TYPES, default: 'text_only' },
        attachmentType: { type: String, enum: EMAIL_BULK_ATTACHMENT_TYPES, default: 'none' },
        attachments: { type: [platformAttachmentRefSchema], default: [] },
        usageCount: { type: Number, default: 0 },
        lastUsedAt: { type: Date, default: null },
        isActive: { type: Boolean, default: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

emailTemplateSchema.index({ companyId: 1, templateName: 1 });

const EmailTemplate = mongoose.model('EmailTemplate', emailTemplateSchema);
export default EmailTemplate;
