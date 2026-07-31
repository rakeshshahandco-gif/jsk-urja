import mongoose from 'mongoose';

export const ELIGIBILITY_STATUSES = [
    'ELIGIBLE', 'NOT_APPROVED', 'LOW_CONFIDENCE_REVIEW', 'DUPLICATE_REVIEW_REQUIRED',
    'CONFLICT_REVIEW_REQUIRED', 'ALREADY_CONVERTED', 'BLOCKED', 'INVALID',
];

export const MATCH_STATUSES = [
    'EXACT_MATCH', 'STRONG_MATCH', 'POSSIBLE_MATCH', 'MULTIPLE_MATCHES',
    'NO_MATCH', 'CONFLICTING_MATCH', 'MANUAL_REVIEW_REQUIRED',
];

export const DRAFT_ACTION_TYPES = [
    'CREATE_LEAD_DRAFT', 'ENRICH_EXISTING_LEAD', 'ENRICH_EXISTING_CUSTOMER',
    'ENRICH_EXISTING_SUPPLIER', 'LINK_ONLY', 'KEEP_SEPARATE', 'NO_ACTION', 'MANUAL_REVIEW_REQUIRED',
];

export const DRAFT_STATUSES = [
    'DRAFT', 'MATCH_REVIEW_REQUIRED', 'FIELD_REVIEW_REQUIRED', 'READY_FOR_APPROVAL',
    'APPROVED', 'CONVERSION_IN_PROGRESS', 'CONVERTED_TO_LEAD', 'ENRICHED_EXISTING_RECORD',
    'PARTIALLY_APPLIED', 'FAILED', 'REJECTED', 'CANCELLED', 'LOCKED',
];

export const FIELD_DECISIONS = [
    'KEEP_CRM', 'USE_EXTRACTED', 'ADD_ALTERNATE', 'KEEP_BOTH', 'MARK_INVALID', 'DEFER', 'REJECT_SUGGESTION', 'PENDING',
];

const historySchema = new mongoose.Schema(
    {
        at: { type: Date, default: Date.now },
        action: { type: String, trim: true, default: '' },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        previousStatus: { type: String, trim: true, default: '' },
        resultingStatus: { type: String, trim: true, default: '' },
        previous: { type: mongoose.Schema.Types.Mixed, default: null },
        next: { type: mongoose.Schema.Types.Mixed, default: null },
        reason: { type: String, trim: true, default: '' },
        targetEntity: { type: String, trim: true, default: '' },
        result: { type: String, trim: true, default: '' },
        sourceType: { type: String, trim: true, default: 'system' },
    },
    { _id: false },
);

const fieldComparisonSchema = new mongoose.Schema(
    {
        fieldKey: { type: String, trim: true, required: true },
        crmField: { type: String, trim: true, default: '' },
        crmCurrentValue: { type: mongoose.Schema.Types.Mixed, default: null },
        suggestedValue: { type: mongoose.Schema.Types.Mixed, default: null },
        normalizedValue: { type: mongoose.Schema.Types.Mixed, default: null },
        source: { type: String, trim: true, default: '' },
        sourceUrl: { type: String, trim: true, default: '' },
        sourceTimestamp: { type: Date, default: null },
        verificationStatus: { type: String, trim: true, default: '' },
        confidence: { type: Number, default: 0 },
        changeType: { type: String, trim: true, default: '' },
        conflictStatus: { type: String, trim: true, default: '' },
        recommendedAction: { type: String, trim: true, default: 'PENDING' },
        userDecision: { type: String, enum: FIELD_DECISIONS, default: 'PENDING' },
        appliedTimestamp: { type: Date, default: null },
        appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        notes: { type: String, trim: true, default: '' },
    },
    { _id: false },
);

const schema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, trim: true, default: '' },
        recordKey: { type: String, trim: true, default: '', index: true },
        idempotencyKey: { type: String, trim: true, default: '', index: true },
        extractedLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExtractedLead', default: null, index: true },
        discoveryJobId: { type: mongoose.Schema.Types.ObjectId, default: null },
        similarCompanyResultId: { type: mongoose.Schema.Types.ObjectId, default: null },
        companyName: { type: String, trim: true, default: '' },
        eligibilityStatus: { type: String, enum: ELIGIBILITY_STATUSES, default: 'NOT_APPROVED', index: true },
        eligibilityReasons: { type: [String], default: [] },
        approvedIntelligenceRefs: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        matchedCrmEntityType: { type: String, enum: ['', 'LEAD', 'CUSTOMER', 'SUPPLIER', 'NONE'], default: 'NONE' },
        matchedCrmEntityId: { type: mongoose.Schema.Types.ObjectId, default: null },
        matchScore: { type: Number, default: 0 },
        matchStatus: { type: String, enum: MATCH_STATUSES, default: 'NO_MATCH', index: true },
        matchEvidence: { type: [mongoose.Schema.Types.Mixed], default: [] },
        matchCandidates: { type: [mongoose.Schema.Types.Mixed], default: [] },
        draftActionType: { type: String, enum: DRAFT_ACTION_TYPES, default: 'MANUAL_REVIEW_REQUIRED', index: true },
        status: { type: String, enum: DRAFT_STATUSES, default: 'DRAFT', index: true },
        proposedCrmFields: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        fieldComparisons: { type: [fieldComparisonSchema], default: [] },
        conflicts: { type: [mongoose.Schema.Types.Mixed], default: [] },
        sourceReferences: { type: [mongoose.Schema.Types.Mixed], default: [] },
        leadScoreSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
        productRecommendationSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
        contactSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
        companyProfileSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
        conversionStatus: { type: String, trim: true, default: '' },
        convertedCrmLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
        enrichmentTransactionId: { type: mongoose.Schema.Types.ObjectId, default: null },
        rollbackMetadata: { type: mongoose.Schema.Types.Mixed, default: null },
        previewPayload: { type: mongoose.Schema.Types.Mixed, default: null },
        finalApprovalAt: { type: Date, default: null },
        finalApprovalBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        manuallyApproved: { type: Boolean, default: false },
        locked: { type: Boolean, default: false },
        lockedAt: { type: Date, default: null },
        lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        history: { type: [historySchema], default: [] },
        noAutoCustomerCreate: { type: Boolean, default: true },
        noAutoSupplierCreate: { type: Boolean, default: true },
        noAutoTaskCreate: { type: Boolean, default: true },
        noAutoCommunications: { type: Boolean, default: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true, collection: 'ai_crm_enrichment_drafts' },
);

schema.index({ companyId: 1, recordKey: 1 }, { unique: true, partialFilterExpression: { isDeleted: { $ne: true }, recordKey: { $gt: '' } } });
schema.index({ companyId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { isDeleted: { $ne: true }, idempotencyKey: { $gt: '' } } });

const AiCrmEnrichmentDraft = mongoose.models.AiCrmEnrichmentDraft || mongoose.model('AiCrmEnrichmentDraft', schema);
export { AiCrmEnrichmentDraft };
export default AiCrmEnrichmentDraft;
