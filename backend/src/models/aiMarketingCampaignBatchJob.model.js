import mongoose from 'mongoose';
import { BATCH_STATUSES } from '../services/dataExtractor/marketingIntelligence/constants.js';

const schema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    campaignDraftId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiMarketingCampaignDraft', default: null, index: true },
    jobType: {
        type: String,
        enum: [
            'build_audience', 'validate_recipients', 'deduplicate', 'validate_optout',
            'check_frequency', 'generate_message', 'refresh_outdated',
        ],
        required: true,
    },
    status: { type: String, enum: BATCH_STATUSES, default: 'QUEUED', index: true },
    total: { type: Number, default: 0 },
    processed: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    lockedSkippedCount: { type: Number, default: 0 },
    cursor: { type: Number, default: 0 },
    results: { type: [mongoose.Schema.Types.Mixed], default: [] },
    errorSummary: { type: String, trim: true, default: '' },
    idempotencyKey: { type: String, trim: true, default: '', index: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastHeartbeatAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

schema.index({ companyId: 1, status: 1, createdAt: -1 });
schema.index({ companyId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $gt: '' } } });

export const AiMarketingCampaignBatchJob = mongoose.models.AiMarketingCampaignBatchJob
    || mongoose.model('AiMarketingCampaignBatchJob', schema);
