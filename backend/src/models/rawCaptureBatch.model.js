import mongoose from 'mongoose';
import {
    RAW_CAPTURE_BATCH_IDEMPOTENCY_INDEX_NAME,
    RAW_CAPTURE_BATCH_STATUSES,
    RAW_CAPTURE_METHODS,
    RAW_CAPTURE_QUERY_SOURCE_HINTS,
    RAW_CAPTURE_SOURCES,
} from '../services/dataExtractor/searchCampaign/rawCapture/constants.js';

const validationErrorSchema = new mongoose.Schema(
    {
        index: { type: Number, required: true },
        message: { type: String, required: true, maxlength: 300 },
    },
    { _id: false },
);

const rawCaptureBatchSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SearchCampaign', required: true, index: true },
        queryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SearchQuery', default: null },
        source: { type: String, enum: RAW_CAPTURE_SOURCES, required: true },
        querySourceHint: { type: String, enum: [...RAW_CAPTURE_QUERY_SOURCE_HINTS, ''], default: '' },
        captureMethod: { type: String, enum: RAW_CAPTURE_METHODS, required: true },
        idempotencyKey: { type: String, required: true, trim: true, maxlength: 200 },
        requestFingerprint: { type: String, required: true, trim: true, maxlength: 64 },
        status: { type: String, enum: RAW_CAPTURE_BATCH_STATUSES, default: 'received', index: true },
        requestedCount: { type: Number, default: 0 },
        acceptedCount: { type: Number, default: 0 },
        insertedCount: { type: Number, default: 0 },
        updatedExistingCount: { type: Number, default: 0 },
        updatedExistingArchivedCount: { type: Number, default: 0 },
        rejectedCount: { type: Number, default: 0 },
        rawCaptureIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RawCapture' }],
        validationErrors: { type: [validationErrorSchema], default: [] },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        completedAt: { type: Date, default: null },
        failedAt: { type: Date, default: null },
        failureCode: { type: String, trim: true, default: '', maxlength: 80 },
        failureMessage: { type: String, trim: true, default: '', maxlength: 500 },
    },
    { timestamps: true, collection: 'raw_capture_batches', autoCreate: false, autoIndex: false },
);

rawCaptureBatchSchema.index(
    { companyId: 1, idempotencyKey: 1 },
    { unique: true, name: RAW_CAPTURE_BATCH_IDEMPOTENCY_INDEX_NAME },
);
rawCaptureBatchSchema.index({ companyId: 1, campaignId: 1, createdAt: -1 });
rawCaptureBatchSchema.index({ companyId: 1, campaignId: 1, queryId: 1, createdAt: -1 });
rawCaptureBatchSchema.index({ companyId: 1, status: 1, createdAt: -1 });

const RawCaptureBatch = mongoose.models.RawCaptureBatch
    || mongoose.model('RawCaptureBatch', rawCaptureBatchSchema);
export { RawCaptureBatch };
export default RawCaptureBatch;
