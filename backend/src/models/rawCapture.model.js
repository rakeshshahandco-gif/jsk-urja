import mongoose from 'mongoose';
import {
    RAW_CAPTURE_DUPLICATE_STATUSES,
    RAW_CAPTURE_ENRICHMENT_STATUSES,
    RAW_CAPTURE_IDENTITY_INDEX_NAME,
    RAW_CAPTURE_INBOX_STATUSES,
    RAW_CAPTURE_METHODS,
    RAW_CAPTURE_QUALIFICATION_STATUSES,
    RAW_CAPTURE_QUERY_SOURCE_HINTS,
    RAW_CAPTURE_RESULT_TYPE_HINTS,
    RAW_CAPTURE_SOURCES,
} from '../services/dataExtractor/searchCampaign/rawCapture/constants.js';

const rawCaptureSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SearchCampaign', required: true, index: true },
        queryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SearchQuery', default: null, index: true },
        queryScopeKey: { type: String, required: true, trim: true },
        captureBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawCaptureBatch', default: null },
        source: { type: String, enum: RAW_CAPTURE_SOURCES, required: true },
        querySourceHint: { type: String, enum: [...RAW_CAPTURE_QUERY_SOURCE_HINTS, ''], default: '' },
        captureMethod: { type: String, enum: RAW_CAPTURE_METHODS, required: true },
        sourceRecordId: { type: String, trim: true, default: '', maxlength: 300 },
        title: { type: String, trim: true, default: '', maxlength: 500 },
        titleNormalized: { type: String, trim: true, default: '' },
        snippet: { type: String, trim: true, default: '', maxlength: 5000 },
        resultUrlOriginal: { type: String, trim: true, default: '', maxlength: 2048 },
        resultUrlNormalized: { type: String, trim: true, default: '', maxlength: 2048 },
        displayDomain: { type: String, trim: true, default: '', index: true },
        resultPosition: { type: Number, default: null },
        resultTypeHint: { type: String, enum: [...RAW_CAPTURE_RESULT_TYPE_HINTS, null], default: 'unknown' },
        captureFingerprint: { type: String, required: true, trim: true },
        firstSeenAt: { type: Date, default: Date.now },
        lastSeenAt: { type: Date, default: Date.now },
        seenCount: { type: Number, default: 1, min: 1 },
        firstCapturedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        lastCapturedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        inboxStatus: { type: String, enum: RAW_CAPTURE_INBOX_STATUSES, default: 'new', index: true },
        notes: { type: String, trim: true, default: '', maxlength: 2000 },
        enrichmentStatus: { type: String, enum: RAW_CAPTURE_ENRICHMENT_STATUSES, default: 'not_started' },
        enrichmentEligible: { type: Boolean, default: false },
        enrichmentBlockedReason: { type: String, trim: true, default: '' },
        qualificationStatus: { type: String, enum: RAW_CAPTURE_QUALIFICATION_STATUSES, default: 'not_started' },
        duplicateStatus: { type: String, enum: RAW_CAPTURE_DUPLICATE_STATUSES, default: 'unchecked' },
        promotedExtractedLeadId: { type: mongoose.Schema.Types.ObjectId, default: null },
        archivedAt: { type: Date, default: null },
        archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, collection: 'raw_captures', autoCreate: false, autoIndex: false },
);

rawCaptureSchema.index({ companyId: 1, campaignId: 1, inboxStatus: 1, lastSeenAt: -1 });
rawCaptureSchema.index({ companyId: 1, campaignId: 1, queryId: 1, lastSeenAt: -1 });
rawCaptureSchema.index({ companyId: 1, campaignId: 1, source: 1, lastSeenAt: -1 });
rawCaptureSchema.index({ companyId: 1, campaignId: 1, displayDomain: 1 });
rawCaptureSchema.index(
    { companyId: 1, campaignId: 1, queryScopeKey: 1, source: 1, captureFingerprint: 1 },
    { unique: true, name: RAW_CAPTURE_IDENTITY_INDEX_NAME },
);

const RawCapture = mongoose.models.RawCapture || mongoose.model('RawCapture', rawCaptureSchema);
export { RawCapture };
export default RawCapture;
