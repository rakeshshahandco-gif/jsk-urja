import mongoose from 'mongoose';

export const SW_ELIGIBILITY = [
    'ELIGIBLE', 'NO_CRM_LEAD', 'PENDING_PHASE13_APPROVAL', 'ALREADY_ASSIGNED',
    'ASSIGNMENT_REVIEW_REQUIRED', 'FOLLOWUP_REVIEW_REQUIRED', 'LOCKED', 'BLOCKED', 'INVALID',
];

export const SW_STATUSES = [
    'DRAFT', 'RECOMMENDATION_READY', 'ASSIGNMENT_REVIEW_REQUIRED', 'FOLLOWUP_REVIEW_REQUIRED',
    'READY_FOR_APPROVAL', 'APPROVED', 'ASSIGNMENT_APPLIED', 'TASKS_CREATED', 'PARTIALLY_APPLIED',
    'REASSIGNED', 'CANCELLED', 'REJECTED', 'LOCKED', 'FAILED',
];

export const OWNER_DECISIONS = [
    'KEEP_EXISTING_OWNER', 'ASSIGN_SUGGESTED_OWNER', 'SELECT_DIFFERENT_OWNER',
    'TEAM_ASSIGNMENT_ONLY', 'DEFER_ASSIGNMENT', 'REJECT_RECOMMENDATION', 'PENDING',
];

const historySchema = new mongoose.Schema({
    at: { type: Date, default: Date.now },
    action: { type: String, trim: true, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    previousStatus: { type: String, trim: true, default: '' },
    resultingStatus: { type: String, trim: true, default: '' },
    previous: { type: mongoose.Schema.Types.Mixed, default: null },
    next: { type: mongoose.Schema.Types.Mixed, default: null },
    reason: { type: String, trim: true, default: '' },
    crmLeadId: { type: mongoose.Schema.Types.ObjectId, default: null },
    selectedSalespersonId: { type: mongoose.Schema.Types.ObjectId, default: null },
    result: { type: String, trim: true, default: '' },
    sourceType: { type: String, trim: true, default: 'system' },
}, { _id: false });

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    financialYear: { type: String, trim: true, default: '' },
    recordKey: { type: String, trim: true, default: '', index: true },
    idempotencyKey: { type: String, trim: true, default: '', index: true },
    crmLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    phase13DraftId: { type: mongoose.Schema.Types.ObjectId, default: null },
    enrichmentTransactionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    extractedLeadId: { type: mongoose.Schema.Types.ObjectId, default: null },
    companyName: { type: String, trim: true, default: '' },
    eligibilityStatus: { type: String, enum: SW_ELIGIBILITY, default: 'INVALID', index: true },
    eligibilityReasons: { type: [String], default: [] },
    status: { type: String, enum: SW_STATUSES, default: 'DRAFT', index: true },
    assignmentStrategy: { type: String, trim: true, default: 'HYBRID' },
    currentOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    currentOwnerName: { type: String, trim: true, default: '' },
    suggestedOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    suggestedOwnerName: { type: String, trim: true, default: '' },
    selectedOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    selectedOwnerName: { type: String, trim: true, default: '' },
    alternativeOwners: { type: [mongoose.Schema.Types.Mixed], default: [] },
    assignmentScoreBreakdown: { type: mongoose.Schema.Types.Mixed, default: null },
    territoryRecommendation: { type: mongoose.Schema.Types.Mixed, default: null },
    teamRecommendation: { type: mongoose.Schema.Types.Mixed, default: null },
    leadScoreSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    productOpportunitySnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    contactSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    followUpPlanDraft: { type: mongoose.Schema.Types.Mixed, default: null },
    taskDrafts: { type: [mongoose.Schema.Types.Mixed], default: [] },
    ownerDecision: { type: String, enum: OWNER_DECISIONS, default: 'PENDING' },
    reassignmentReason: { type: String, trim: true, default: '' },
    approveAssignment: { type: Boolean, default: false },
    approveTask: { type: Boolean, default: false },
    approveFollowUp: { type: Boolean, default: false },
    previewPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    appliedAssignment: { type: mongoose.Schema.Types.Mixed, default: null },
    appliedTaskIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    appliedFollowUpRef: { type: mongoose.Schema.Types.Mixed, default: null },
    duplicateCheck: { type: mongoose.Schema.Types.Mixed, default: null },
    transactionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    rollbackMetadata: { type: mongoose.Schema.Types.Mixed, default: null },
    manuallyApproved: { type: Boolean, default: false },
    finalApprovalAt: { type: Date, default: null },
    finalApprovalBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    locked: { type: Boolean, default: false },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    history: { type: [historySchema], default: [] },
    noAutoCommunications: { type: Boolean, default: true },
    noAutoCustomerCreate: { type: Boolean, default: true },
    noAutoSupplierCreate: { type: Boolean, default: true },
    noAutoQuotationCreate: { type: Boolean, default: true },
    noAutoSalesOrderCreate: { type: Boolean, default: true },
    settingsVersion: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true, collection: 'ai_sales_workflow_drafts' });

schema.index({ companyId: 1, recordKey: 1 }, { unique: true, partialFilterExpression: { isDeleted: { $ne: true }, recordKey: { $gt: '' } } });
schema.index({ companyId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { isDeleted: { $ne: true }, idempotencyKey: { $gt: '' } } });

const AiSalesWorkflowDraft = mongoose.models.AiSalesWorkflowDraft || mongoose.model('AiSalesWorkflowDraft', schema);
export { AiSalesWorkflowDraft };
export default AiSalesWorkflowDraft;
