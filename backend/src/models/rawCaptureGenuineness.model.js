import mongoose from 'mongoose';
import {
    CONFIDENCE_LEVELS,
    GENUINENESS_DECISIONS,
    GENUINENESS_JOB_STATUSES,
    MANUFACTURER_EVIDENCE,
    OWNER_REVIEW_STATUSES,
    VERIFICATION_METHODS,
    VERIFICATION_STATUSES,
} from '../services/dataExtractor/searchCampaign/rawCaptureGenuineness/constants.js';

const auditSchema = new mongoose.Schema(
    {
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        action: { type: String, trim: true, maxlength: 80 },
        from: { type: String, trim: true, maxlength: 80 },
        to: { type: String, trim: true, maxlength: 80 },
        note: { type: String, trim: true, maxlength: 1000 },
    },
    { _id: false },
);

const rawCaptureGenuinenessSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SearchCampaign', required: true, index: true },
        sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssistedCaptureSession', default: null, index: true },
        qualificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawCaptureQualification', required: true, index: true },
        enrichmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawCaptureEnrichment', default: null, index: true },
        canonicalDomain: { type: String, trim: true, lowercase: true, default: '', maxlength: 255, index: true },
        companyName: { type: String, trim: true, default: '', maxlength: 300 },
        websiteUrl: { type: String, trim: true, default: '', maxlength: 2048 },

        // System (rule/AI) decision — immutable once written for a run; owner review kept separately.
        systemDecision: { type: String, enum: GENUINENESS_DECISIONS, required: true },
        genuinenessScore: { type: Number, default: 0, min: 0, max: 100 },
        genuinenessConfidence: { type: String, enum: CONFIDENCE_LEVELS, default: 'low' },
        verificationReason: { type: String, trim: true, default: '', maxlength: 2000 },
        positiveSignals: { type: [String], default: [] },
        warningSignals: { type: [String], default: [] },
        conflictingEvidence: { type: [String], default: [] },
        missingCriticalFields: { type: [String], default: [] },
        evidenceUrls: { type: [String], default: [] },
        manufacturerEvidence: { type: String, enum: MANUFACTURER_EVIDENCE, default: 'unknown' },

        verificationMethod: { type: String, enum: VERIFICATION_METHODS, default: 'rule_based' },
        ruleVersion: { type: String, trim: true, default: '', maxlength: 80 },
        modelVersion: { type: String, trim: true, default: '', maxlength: 120 },
        verifiedAt: { type: Date, default: null },

        verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: 'queued', index: true },

        // Owner review — never overwrites systemDecision.
        ownerDecision: { type: String, enum: [...GENUINENESS_DECISIONS, ''], default: '' },
        ownerReviewStatus: { type: String, enum: OWNER_REVIEW_STATUSES, default: 'unreviewed', index: true },
        ownerReviewNote: { type: String, trim: true, default: '', maxlength: 2000 },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reviewedAt: { type: Date, default: null },
        auditHistory: { type: [auditSchema], default: [] },

        // Raw engine outputs preserved separately for traceability/debugging (never used for display directly).
        ruleResult: { type: mongoose.Schema.Types.Mixed, default: null },
        aiResult: { type: mongoose.Schema.Types.Mixed, default: null },

        errorReason: { type: String, trim: true, default: '', maxlength: 500 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, collection: 'raw_capture_genuineness', autoCreate: false, autoIndex: false },
);

rawCaptureGenuinenessSchema.index(
    { companyId: 1, campaignId: 1, qualificationId: 1 },
    { unique: true, name: 'uniq_raw_capture_genuineness_qualification' },
);
rawCaptureGenuinenessSchema.index({ companyId: 1, sessionId: 1, systemDecision: 1 });

const genuinenessJobSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SearchCampaign', required: true, index: true },
        sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssistedCaptureSession', default: null, index: true },
        mode: { type: String, enum: ['selected', 'all_qualified', 'retry_failed'], default: 'all_qualified' },
        selectedQualificationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RawCaptureQualification' }],
        status: { type: String, enum: GENUINENESS_JOB_STATUSES, default: 'queued', index: true },
        stopRequested: { type: Boolean, default: false },
        total: { type: Number, default: 0 },
        processed: { type: Number, default: 0 },
        verifiedGenuineCount: { type: Number, default: 0 },
        likelyGenuineCount: { type: Number, default: 0 },
        humanReviewRequiredCount: { type: Number, default: 0 },
        directoryOrMarketplaceOnlyCount: { type: Number, default: 0 },
        suspectedUnreliableCount: { type: Number, default: 0 },
        rejectedUnusableCount: { type: Number, default: 0 },
        failedCount: { type: Number, default: 0 },
        ruleBasedCount: { type: Number, default: 0 },
        ollamaCount: { type: Number, default: 0 },
        currentDomain: { type: String, trim: true, default: '' },
        lastError: { type: String, trim: true, default: '', maxlength: 500 },
        productHint: { type: String, trim: true, default: '', maxlength: 200 },
        locationHint: { type: String, trim: true, default: '', maxlength: 200 },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, collection: 'raw_capture_genuineness_jobs', autoCreate: false, autoIndex: false },
);

genuinenessJobSchema.index({ companyId: 1, sessionId: 1, createdAt: -1 });

export const RawCaptureGenuineness = mongoose.models.RawCaptureGenuineness
    || mongoose.model('RawCaptureGenuineness', rawCaptureGenuinenessSchema);
export const RawCaptureGenuinenessJob = mongoose.models.RawCaptureGenuinenessJob
    || mongoose.model('RawCaptureGenuinenessJob', genuinenessJobSchema);
export default RawCaptureGenuineness;
