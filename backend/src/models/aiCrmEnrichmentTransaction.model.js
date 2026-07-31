import mongoose from 'mongoose';

export const TX_STATUSES = [
    'PREVIEW', 'APPROVED', 'APPLIED', 'PARTIALLY_APPLIED', 'FAILED', 'ROLLED_BACK', 'ROLLBACK_FAILED', 'ROLLBACK_CONFLICT',
];

const schema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        draftId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiCrmEnrichmentDraft', required: true, index: true },
        crmEntityType: { type: String, enum: ['LEAD', 'CUSTOMER', 'SUPPLIER'], required: true },
        crmEntityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        actionType: { type: String, trim: true, default: '' },
        status: { type: String, enum: TX_STATUSES, default: 'PREVIEW', index: true },
        beforeValues: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        appliedValues: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        rejectedValues: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        alternateValues: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        sourceReferences: { type: [mongoose.Schema.Types.Mixed], default: [] },
        approvalReference: { type: String, trim: true, default: '' },
        reason: { type: String, trim: true, default: '' },
        appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        appliedAt: { type: Date, default: null },
        rollbackCapability: { type: Boolean, default: true },
        rollbackResult: { type: String, trim: true, default: '' },
        rollbackAt: { type: Date, default: null },
        rollbackBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        auditEntries: { type: [mongoose.Schema.Types.Mixed], default: [] },
        idempotencyKey: { type: String, trim: true, default: '', index: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true, collection: 'ai_crm_enrichment_transactions' },
);

schema.index({ companyId: 1, draftId: 1, actionType: 1, idempotencyKey: 1 });

const AiCrmEnrichmentTransaction = mongoose.models.AiCrmEnrichmentTransaction || mongoose.model('AiCrmEnrichmentTransaction', schema);
export { AiCrmEnrichmentTransaction };
export default AiCrmEnrichmentTransaction;
