import mongoose from 'mongoose';
import { softDeleteAuditFields } from './sharedFields.js';
import { WHATSAPP_AI_MEMORY_STATUSES } from '../constants/whatsappAi.constants.js';

/**
 * Approved structured context only â€” not a raw chat dump.
 * Do not store: credentials, OTP, passwords, bank/card data, government IDs, health data.
 * Summaries must stay short; sourceConversationIds are ObjectId refs only.
 */
const whatsAppAICustomerMemorySchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
        normalizedMobile: { type: String, trim: true, required: true, maxlength: 20 },
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
        leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
        preferredLanguage: { type: String, trim: true, default: 'en', maxlength: 16 },
        preferredSalespersonId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        interestedProductCategories: { type: [String], default: [] },
        interestedProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProductCatalog' }],
        lastRequirementSummary: { type: String, default: '', maxlength: 2000 },
        lastQuotationReference: { type: String, trim: true, default: '', maxlength: 120 },
        openSupportSummary: { type: String, default: '', maxlength: 2000 },
        previousConversationSummary: { type: String, default: '', maxlength: 4000 },
        lastInteractionAt: { type: Date, default: null },
        memoryStatus: {
            type: String,
            enum: WHATSAPP_AI_MEMORY_STATUSES,
            default: 'draft',
        },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        approvedAt: { type: Date, default: null },
        sourceConversationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppAIConversation' }],
        ...softDeleteAuditFields,
    },
    { timestamps: true, collection: 'whatsapp_ai_customer_memory' },
);

whatsAppAICustomerMemorySchema.index(
    { companyId: 1, normalizedMobile: 1 },
    {
        unique: true,
        name: 'uniq_company_normalizedMobile',
        partialFilterExpression: { isDeleted: false, normalizedMobile: { $type: 'string', $gt: '' } },
    },
);

whatsAppAICustomerMemorySchema.pre('validate', function customerMemoryApprovalGuard() {
    if (this.memoryStatus === 'approved') {
        if (!this.approvedBy) {
            this.invalidate('approvedBy', 'approved memory requires approvedBy and approvedAt');
        }
        if (!this.approvedAt) {
            this.invalidate('approvedAt', 'approved memory requires approvedBy and approvedAt');
        }
    }
});

const WhatsAppAICustomerMemory = mongoose.models.WhatsAppAICustomerMemory
    || mongoose.model('WhatsAppAICustomerMemory', whatsAppAICustomerMemorySchema);

export default WhatsAppAICustomerMemory;
