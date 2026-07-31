import mongoose from 'mongoose';

export const SW_TX_STATUSES = [
    'PREVIEW', 'APPROVED', 'APPLIED', 'PARTIALLY_APPLIED', 'FAILED',
    'CANCELLED', 'ROLLED_BACK', 'ROLLBACK_CONFLICT', 'ROLLBACK_FAILED',
];

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    draftId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiSalesWorkflowDraft', required: true, index: true },
    crmLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    actionTypes: { type: [String], default: [] },
    status: { type: String, enum: SW_TX_STATUSES, default: 'PREVIEW', index: true },
    beforeValues: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    appliedValues: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    rejectedValues: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    appliedTaskIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    followUpApplied: { type: mongoose.Schema.Types.Mixed, default: null },
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
}, { timestamps: true, collection: 'ai_sales_workflow_transactions' });

const AiSalesWorkflowTransaction = mongoose.models.AiSalesWorkflowTransaction || mongoose.model('AiSalesWorkflowTransaction', schema);
export { AiSalesWorkflowTransaction };
export default AiSalesWorkflowTransaction;
