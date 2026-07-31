import mongoose from 'mongoose';

export const BATCH_STATUSES = ['QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'STOPPED'];

const schema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, trim: true, default: '' },
        status: { type: String, enum: BATCH_STATUSES, default: 'QUEUED', index: true },
        mode: { type: String, trim: true, default: 'rule_based' },
        jobType: { type: String, trim: true, default: 'similar_companies' },
        scope: { type: String, trim: true, default: 'selected' },
        cursor: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        successCount: { type: Number, default: 0 },
        failedCount: { type: Number, default: 0 },
        skippedCount: { type: Number, default: 0 },
        lockedSkippedCount: { type: Number, default: 0 },
        unchangedSkippedCount: { type: Number, default: 0 },
        processedCount: { type: Number, default: 0 },
        providerCallCount: { type: Number, default: 0 },
        maxProviderCalls: { type: Number, default: 0 },
        paidProviderConfirmed: { type: Boolean, default: false },
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
    { timestamps: true, collection: 'ai_similar_company_batch_jobs' },
);

schema.index({ companyId: 1, status: 1, createdAt: -1 });

const AiSimilarCompanyBatchJob = mongoose.models.AiSimilarCompanyBatchJob || mongoose.model('AiSimilarCompanyBatchJob', schema);
export { AiSimilarCompanyBatchJob };
export default AiSimilarCompanyBatchJob;
