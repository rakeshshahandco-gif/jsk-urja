import mongoose from 'mongoose';
import { softDeleteAuditFields } from './sharedFields.js';
import {
    WHATSAPP_AI_APPROVAL_STATUSES,
    WHATSAPP_AI_DUPLICATE_CHECK_STATUSES,
} from '../constants/whatsappAi.constants.js';

const whatsAppAILeadDraftSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WhatsAppAIConversation',
            default: null,
        },
        normalizedMobile: { type: String, trim: true, default: '', maxlength: 20 },
        customerName: { type: String, trim: true, default: '', maxlength: 200 },
        companyName: { type: String, trim: true, default: '', maxlength: 200 },
        city: { type: String, trim: true, default: '', maxlength: 100 },
        state: { type: String, trim: true, default: '', maxlength: 100 },
        country: { type: String, trim: true, default: '', maxlength: 100 },
        email: { type: String, trim: true, default: '', maxlength: 200 },
        productCategory: { type: String, trim: true, default: '', maxlength: 120 },
        productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProductCatalog' }],
        requirement: { type: String, default: '', maxlength: 5000 },
        quantity: { type: String, trim: true, default: '', maxlength: 64 },
        expectedPurchaseDate: { type: Date, default: null },
        source: { type: String, trim: true, default: 'whatsapp_ai', maxlength: 64 },
        assignedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        duplicateCheckStatus: {
            type: String,
            enum: WHATSAPP_AI_DUPLICATE_CHECK_STATUSES,
            default: 'pending',
        },
        // Compact match summaries only — never store full documents or binaries.
        duplicateMatches: { type: [mongoose.Schema.Types.Mixed], default: [] },
        approvalStatus: {
            type: String,
            enum: WHATSAPP_AI_APPROVAL_STATUSES,
            default: 'draft',
        },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        approvedAt: { type: Date, default: null },
        rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        rejectedAt: { type: Date, default: null },
        rejectionReason: { type: String, trim: true, default: '', maxlength: 1000 },
        promotedLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
        ...softDeleteAuditFields,
    },
    { timestamps: true, collection: 'whatsapp_ai_lead_drafts' },
);

whatsAppAILeadDraftSchema.index({ companyId: 1, approvalStatus: 1, isDeleted: 1 }, { name: 'idx_company_approval' });
whatsAppAILeadDraftSchema.index({ companyId: 1, normalizedMobile: 1, isDeleted: 1 }, { name: 'idx_company_mobile' });

const WhatsAppAILeadDraft = mongoose.models.WhatsAppAILeadDraft
    || mongoose.model('WhatsAppAILeadDraft', whatsAppAILeadDraftSchema);

export default WhatsAppAILeadDraft;
