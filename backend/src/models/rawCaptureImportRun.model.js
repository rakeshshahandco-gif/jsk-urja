import mongoose from 'mongoose';
import {
    ADAPTER_TO_CAPTURE_METHOD,
    IMPORT_ADAPTER_TYPES,
    IMPORT_RUN_IDEMPOTENCY_INDEX_NAME,
    IMPORT_RUN_STATUSES,
    IMPORT_VALIDATION_ERRORS_MAX,
} from '../services/dataExtractor/searchCampaign/rawCaptureImport/constants.js';
import { RAW_CAPTURE_SOURCES } from '../services/dataExtractor/searchCampaign/rawCapture/constants.js';

const validationErrorSchema = new mongoose.Schema(
    {
        rowNumber: { type: Number, default: null },
        sheetName: { type: String, default: '', maxlength: 200 },
        field: { type: String, default: '', maxlength: 80 },
        code: { type: String, default: '', maxlength: 80 },
        message: { type: String, required: true, maxlength: 300 },
    },
    { _id: false },
);

const chunkStateSchema = new mongoose.Schema(
    {
        seq: { type: Number, required: true },
        childIdempotencyKey: { type: String, required: true, maxlength: 200 },
        contentHash: { type: String, default: '', maxlength: 64 },
        status: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed'],
            default: 'pending',
        },
        batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawCaptureBatch', default: null },
        acceptedCount: { type: Number, default: 0 },
        insertedCount: { type: Number, default: 0 },
        updatedExistingCount: { type: Number, default: 0 },
        rejectedCount: { type: Number, default: 0 },
        failureCode: { type: String, default: '', maxlength: 80 },
    },
    { _id: false },
);

const rawCaptureImportRunSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SearchCampaign', required: true, index: true },
        queryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SearchQuery', default: null },
        adapterType: { type: String, enum: IMPORT_ADAPTER_TYPES, required: true },
        source: { type: String, enum: RAW_CAPTURE_SOURCES, required: true },
        captureMethod: {
            type: String,
            enum: Object.values(ADAPTER_TO_CAPTURE_METHOD),
            required: true,
        },
        idempotencyKey: { type: String, required: true, trim: true, maxlength: 200 },
        requestFingerprint: { type: String, required: true, trim: true, maxlength: 64 },
        status: { type: String, enum: IMPORT_RUN_STATUSES, default: 'received', index: true },
        originalFileName: { type: String, default: '', maxlength: 200 },
        sanitizedFileName: { type: String, default: '', maxlength: 200 },
        fileExtension: { type: String, default: '', maxlength: 20 },
        fileMimeType: { type: String, default: '', maxlength: 120 },
        fileSize: { type: Number, default: 0 },
        fileSha256: { type: String, default: '', maxlength: 64 },
        contentHash: { type: String, default: '', maxlength: 64 },
        detectedDelimiter: { type: String, default: '', maxlength: 8 },
        detectedEncoding: { type: String, default: '', maxlength: 40 },
        sheetName: { type: String, default: '', maxlength: 200 },
        availableColumns: { type: [String], default: [] },
        columnMapping: { type: mongoose.Schema.Types.Mixed, default: {} },
        totalInputRows: { type: Number, default: 0 },
        previewedRows: { type: Number, default: 0 },
        parsedRows: { type: Number, default: 0 },
        acceptedRows: { type: Number, default: 0 },
        rejectedRows: { type: Number, default: 0 },
        duplicateWithinImportCount: { type: Number, default: 0 },
        allowReviewRequired: { type: Boolean, default: false },
        reviewOverrideBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reviewOverrideAt: { type: Date, default: null },
        reviewRequiredAcceptedCount: { type: Number, default: 0 },
        insertedCount: { type: Number, default: 0 },
        updatedExistingCount: { type: Number, default: 0 },
        rawCaptureBatchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RawCaptureBatch' }],
        chunkStates: { type: [chunkStateSchema], default: [] },
        validationErrors: {
            type: [validationErrorSchema],
            default: [],
            validate: {
                validator(v) { return !v || v.length <= IMPORT_VALIDATION_ERRORS_MAX; },
                message: 'Too many validation errors stored',
            },
        },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        completedAt: { type: Date, default: null },
        failedAt: { type: Date, default: null },
        failureCode: { type: String, default: '', maxlength: 80 },
        failureMessage: { type: String, default: '', maxlength: 500 },
    },
    { timestamps: true, collection: 'raw_capture_import_runs' },
);

rawCaptureImportRunSchema.index(
    { companyId: 1, idempotencyKey: 1 },
    { unique: true, name: IMPORT_RUN_IDEMPOTENCY_INDEX_NAME },
);
rawCaptureImportRunSchema.index({ companyId: 1, campaignId: 1, createdAt: -1 });
rawCaptureImportRunSchema.index({ companyId: 1, campaignId: 1, queryId: 1, createdAt: -1 });
rawCaptureImportRunSchema.index({ companyId: 1, status: 1, createdAt: -1 });

const RawCaptureImportRun = mongoose.models.RawCaptureImportRun
    || mongoose.model('RawCaptureImportRun', rawCaptureImportRunSchema);
export { RawCaptureImportRun };
export default RawCaptureImportRun;
