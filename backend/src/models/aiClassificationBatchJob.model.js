import mongoose from 'mongoose';

export const BATCH_STATUSES = ['QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'STOPPED'];

const aiClassificationBatchJobSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, trim: true, default: '' },
        status: { type: String, enum: BATCH_STATUSES, default: 'QUEUED', index: true },
        mode: { type: String, trim: true, default: 'rule_based' },
        scope: { type: String, trim: true, default: 'selected' },
        discoveryJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiscoveryJob', default: null },
        recordIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
        previewIndexes: { type: [Number], default: [] },
        cursor: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        successCount: { type: Number, default: 0 },
        failedCount: { type: Number, default: 0 },
        skippedCount: { type: Number, default: 0 },
        lockedSkippedCount: { type: Number, default: 0 },
        processedCount: { type: Number, default: 0 },
        idempotencyKey: { type: String, trim: true, default: '', index: true },
        pauseReason: { type: String, trim: true, default: '' },
        lastError: { type: String, trim: true, default: '' },
        errors: { type: [mongoose.Schema.Types.Mixed], default: [] },
        results: { type: [mongoose.Schema.Types.Mixed], default: [] },
        auditLog: { type: [mongoose.Schema.Types.Mixed], default: [] },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        startedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true, collection: 'ai_classification_batch_jobs' },
);

aiClassificationBatchJobSchema.index({ companyId: 1, status: 1, createdAt: -1 });

const AiClassificationBatchJob = mongoose.models.AiClassificationBatchJob
    || mongoose.model('AiClassificationBatchJob', aiClassificationBatchJobSchema);
export { AiClassificationBatchJob };
export default AiClassificationBatchJob;
