import mongoose from 'mongoose';
import { softDeleteAuditFields } from './sharedFields.js';
import {
    WHATSAPP_AI_DOCUMENT_TYPES,
    WHATSAPP_AI_APPROVAL_STATUSES,
} from '../constants/whatsappAi.constants.js';

const whatsAppAIDocumentReferenceSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCatalog', default: null },
        knowledgeId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppAIKnowledge', default: null },
        title: { type: String, required: true, trim: true, maxlength: 300 },
        documentType: { type: String, enum: WHATSAPP_AI_DOCUMENT_TYPES, default: 'other' },
        fileName: { type: String, trim: true, default: '', maxlength: 260 },
        fileUrl: { type: String, trim: true, default: '', maxlength: 2000 },
        storageReference: { type: String, trim: true, default: '', maxlength: 1000 },
        mimeType: { type: String, trim: true, default: '', maxlength: 120 },
        fileSize: { type: Number, default: null, min: 0 },
        checksum: { type: String, trim: true, default: '', maxlength: 128 },
        language: { type: String, trim: true, default: 'en', maxlength: 16 },
        approvalStatus: {
            type: String,
            enum: WHATSAPP_AI_APPROVAL_STATUSES,
            default: 'draft',
        },
        // Metadata/URL only — never store file binaries or base64 here.
        active: { type: Boolean, default: false },
        ...softDeleteAuditFields,
    },
    { timestamps: true, collection: 'whatsapp_ai_document_references' },
);

whatsAppAIDocumentReferenceSchema.index({ companyId: 1, productId: 1, isDeleted: 1 }, { name: 'idx_company_product' });
whatsAppAIDocumentReferenceSchema.index(
    { companyId: 1, active: 1, approvalStatus: 1, isDeleted: 1 },
    { name: 'idx_company_active_approval' },
);

const WhatsAppAIDocumentReference = mongoose.models.WhatsAppAIDocumentReference
    || mongoose.model('WhatsAppAIDocumentReference', whatsAppAIDocumentReferenceSchema);

export default WhatsAppAIDocumentReference;
