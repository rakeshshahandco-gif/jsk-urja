import mongoose from 'mongoose';

export const BATCH_STATUSES = ['QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'STOPPED'];

const schema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, trim: true, default: '' },
        status: { type: String, enum: BATCH_STATUSES, default: 'QUEUED', index: true },
        jobType: { type: String, trim: true, default: 'prepare_matches' },
        scope: { type: String, trim: true, default: 'selected' },
        cursor: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        successCount: { type: Number, default: 0 },
        failedCount: { type: Number, default: 0 },
        skippedCount: { type: Number, default: 0 },
        lockedSkippedCount: { type: Number, default: 0 },
        alreadyConvertedSkippedCount: { type: Number, default: 0 },
        processedCount: { type: Number, default: 0 },
        batchApprovalConfirmed: { type: Boolean, default: false },
        pauseReason: { type: String, trim: true, default: '' },
        idempotencyKey: { type: String, trim: true, default: '', index: true },
        results: { type: [mongoose.Schema.Types.Mixed], default: [] },
        errors: { type: [mongoose.Schema.Types.Mixed], default: [] },
        auditLog: { type: [mongoose.Schema.Types.Mixed], default: [] },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        startedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true, collection: 'ai_crm_enrichment_batch_jobs' },
);

const AiCrmEnrichmentBatchJob = mongoose.models.AiCrmEnrichmentBatchJob || mongoose.model('AiCrmEnrichmentBatchJob', schema);
export { AiCrmEnrichmentBatchJob };
export default AiCrmEnrichmentBatchJob;
