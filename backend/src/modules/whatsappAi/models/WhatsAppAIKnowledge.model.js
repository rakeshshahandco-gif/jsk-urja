import mongoose from 'mongoose';
import { softDeleteAuditFields } from './sharedFields.js';
import { WHATSAPP_AI_APPROVAL_STATUSES } from '../constants/whatsappAi.constants.js';

const whatsAppAIKnowledgeSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
        title: { type: String, required: true, trim: true, maxlength: 300 },
        content: { type: String, default: '', maxlength: 20000 },
        category: { type: String, trim: true, default: '', maxlength: 120 },
        subcategory: { type: String, trim: true, default: '', maxlength: 120 },
        language: { type: String, trim: true, default: 'en', maxlength: 16 },
        keywords: { type: [String], default: [] },
        applicableProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProductCatalog' }],
        approvalStatus: {
            type: String,
            enum: WHATSAPP_AI_APPROVAL_STATUSES,
            default: 'draft',
        },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        approvedAt: { type: Date, default: null },
        rejectionReason: { type: String, trim: true, default: '', maxlength: 1000 },
        // New knowledge is never AI-usable until approved AND explicitly activated.
        active: { type: Boolean, default: false },
        version: { type: Number, default: 1, min: 1 },
        effectiveFrom: { type: Date, default: null },
        effectiveTo: { type: Date, default: null },
        sourceDocumentReferences: [{ type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppAIDocumentReference' }],
        ...softDeleteAuditFields,
    },
    { timestamps: true, collection: 'whatsapp_ai_knowledge' },
);

whatsAppAIKnowledgeSchema.index(
    { companyId: 1, approvalStatus: 1, active: 1, isDeleted: 1 },
    { name: 'idx_company_approval_active' },
);
whatsAppAIKnowledgeSchema.index({ companyId: 1, title: 1, isDeleted: 1 }, { name: 'idx_company_title' });

/** Draft/pending/rejected/archived must never be active. */
whatsAppAIKnowledgeSchema.pre('validate', function knowledgeActiveGuard() {
    if (this.approvalStatus !== 'approved' && this.active) {
        this.active = false;
    }
});

const WhatsAppAIKnowledge = mongoose.models.WhatsAppAIKnowledge
    || mongoose.model('WhatsAppAIKnowledge', whatsAppAIKnowledgeSchema);

export default WhatsAppAIKnowledge;
