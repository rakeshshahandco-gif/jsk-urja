import mongoose from 'mongoose';
import {
    BUSINESS_TYPES,
    CONFIDENCE_LEVELS,
    OWNER_REVIEW_STATUSES,
    QUALIFICATION_DECISIONS,
    QUALIFICATION_JOB_STATUSES,
    QUALIFICATION_STATUSES,
} from '../services/dataExtractor/searchCampaign/rawCaptureQualification/constants.js';

const evidenceSchema = new mongoose.Schema(
    {
        field: { type: String, trim: true, maxlength: 80 },
        value: { type: String, trim: true, maxlength: 1000 },
        sourceUrl: { type: String, trim: true, maxlength: 2048 },
        note: { type: String, trim: true, maxlength: 500 },
    },
    { _id: false },
);

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

const rawCaptureQualificationSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SearchCampaign', required: true, index: true },
        sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssistedCaptureSession', default: null, index: true },
        enrichmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawCaptureEnrichment', required: true, index: true },
        canonicalDomain: { type: String, required: true, trim: true, lowercase: true, maxlength: 255, index: true },
        companyName: { type: String, trim: true, default: '', maxlength: 300 },
        websiteUrl: { type: String, trim: true, default: '', maxlength: 2048 },

        // System decision (immutable once set for a run; owner decision stored separately)
        systemDecision: { type: String, enum: QUALIFICATION_DECISIONS, required: true },
        relevanceScore: { type: Number, default: 0, min: 0, max: 100 },
        confidence: { type: String, enum: CONFIDENCE_LEVELS, default: 'low' },
        decisionReason: { type: String, trim: true, default: '', maxlength: 2000 },
        matchedKeywords: { type: [String], default: [] },
        unmatchedOrConflictingEvidence: { type: [String], default: [] },
        productsMatched: { type: [String], default: [] },
        businessType: { type: String, enum: BUSINESS_TYPES, default: 'unknown' },
        locationMatch: { type: String, enum: ['match', 'partial', 'mismatch', 'unknown'], default: 'unknown' },
        locationClassification: { type: String, trim: true, default: '', maxlength: 120 },
        locationMatchMode: { type: String, trim: true, default: 'strict_city', maxlength: 40 },
        productMatchStrength: { type: String, trim: true, default: '', maxlength: 80 },
        confirmedCities: { type: [String], default: [] },
        confirmedStates: { type: [String], default: [] },
        officeInSelectedCity: { type: Boolean, default: false },
        servesSelectedCity: { type: Boolean, default: false },
        locationEvidenceUrl: { type: String, trim: true, default: '', maxlength: 2048 },
        selectedCity: { type: String, trim: true, default: '', maxlength: 120 },
        addressCount: { type: Number, default: 0, min: 0 },
        previousLocationMatch: { type: String, trim: true, default: '', maxlength: 40 },
        previousLocationClassification: { type: String, trim: true, default: '', maxlength: 120 },
        locationRecheckedAt: { type: Date, default: null },
        contactQualityScore: { type: Number, default: 0, min: 0, max: 100 },
        contactQualityBreakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
        sourceEvidence: { type: [evidenceSchema], default: [] },

        qualificationStatus: { type: String, enum: QUALIFICATION_STATUSES, default: 'queued', index: true },
        qualificationMethod: { type: String, enum: ['rule_based', 'ollama_local', 'rule_based_fallback'], default: 'rule_based' },
        ruleEngineVersion: { type: String, trim: true, default: '', maxlength: 80 },
        aiModel: { type: String, trim: true, default: '', maxlength: 120 },
        aiSchemaVersion: { type: String, trim: true, default: '', maxlength: 80 },
        qualifiedAt: { type: Date, default: null },

        // Owner review — does not erase systemDecision
        ownerDecision: { type: String, enum: [...QUALIFICATION_DECISIONS, ''], default: '' },
        ownerReviewStatus: { type: String, enum: OWNER_REVIEW_STATUSES, default: 'unreviewed', index: true },
        ownerReviewNote: { type: String, trim: true, default: '', maxlength: 2000 },
        ownerBusinessTypeOverride: { type: String, enum: [...BUSINESS_TYPES, ''], default: '' },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reviewedAt: { type: Date, default: null },
        auditHistory: { type: [auditSchema], default: [] },

        errorReason: { type: String, trim: true, default: '', maxlength: 500 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, collection: 'raw_capture_qualifications' },
);

rawCaptureQualificationSchema.index(
    { companyId: 1, campaignId: 1, enrichmentId: 1 },
    { unique: true, name: 'uniq_raw_capture_qualification_enrichment' },
);
rawCaptureQualificationSchema.index({ companyId: 1, sessionId: 1, systemDecision: 1 });

const qualificationJobSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SearchCampaign', required: true, index: true },
        sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssistedCaptureSession', default: null, index: true },
        mode: { type: String, enum: ['selected', 'all_enriched', 'retry_failed'], default: 'all_enriched' },
        selectedEnrichmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RawCaptureEnrichment' }],
        status: { type: String, enum: QUALIFICATION_JOB_STATUSES, default: 'queued', index: true },
        stopRequested: { type: Boolean, default: false },
        total: { type: Number, default: 0 },
        processed: { type: Number, default: 0 },
        strongMatchCount: { type: Number, default: 0 },
        possibleMatchCount: { type: Number, default: 0 },
        rejectedCount: { type: Number, default: 0 },
        reviewRequiredCount: { type: Number, default: 0 },
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
    { timestamps: true, collection: 'raw_capture_qualification_jobs' },
);

qualificationJobSchema.index({ companyId: 1, sessionId: 1, createdAt: -1 });

const locationRecheckJobSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SearchCampaign', required: true, index: true },
        sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssistedCaptureSession', default: null, index: true },
        status: {
            type: String,
            enum: ['queued', 'processing', 'completed', 'partial', 'failed', 'stopped'],
            default: 'queued',
            index: true,
        },
        stopRequested: { type: Boolean, default: false },
        refreshAddresses: { type: Boolean, default: true },
        total: { type: Number, default: 0 },
        checked: { type: Number, default: 0 },
        enrichmentsRechecked: { type: Number, default: 0 },
        addressesRefreshed: { type: Number, default: 0 },
        exactCityConfirmed: { type: Number, default: 0 },
        servesCityOnly: { type: Number, default: 0 },
        differentCityConfirmed: { type: Number, default: 0 },
        locationNotConfirmed: { type: Number, default: 0 },
        addressMissing: { type: Number, default: 0 },
        jobCourseTraining: { type: Number, default: 0 },
        unrelatedProduct: { type: Number, default: 0 },
        directoryOnly: { type: Number, default: 0 },
        strictProspects: { type: Number, default: 0 },
        failedRetryable: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        remaining: { type: Number, default: 0 },
        currentCompany: { type: String, trim: true, default: '', maxlength: 300 },
        selectedCityEntered: { type: String, trim: true, default: '', maxlength: 120 },
        selectedCityInterpreted: { type: String, trim: true, default: '', maxlength: 120 },
        ruleEngineVersion: { type: String, trim: true, default: '', maxlength: 80 },
        lastError: { type: String, trim: true, default: '', maxlength: 500 },
        reconciliation: { type: mongoose.Schema.Types.Mixed, default: {} },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, collection: 'raw_capture_location_recheck_jobs' },
);

locationRecheckJobSchema.index({ companyId: 1, sessionId: 1, createdAt: -1 });

export const RawCaptureQualification = mongoose.models.RawCaptureQualification
    || mongoose.model('RawCaptureQualification', rawCaptureQualificationSchema);
export const RawCaptureQualificationJob = mongoose.models.RawCaptureQualificationJob
    || mongoose.model('RawCaptureQualificationJob', qualificationJobSchema);
export const RawCaptureLocationRecheckJob = mongoose.models.RawCaptureLocationRecheckJob
    || mongoose.model('RawCaptureLocationRecheckJob', locationRecheckJobSchema);
export default RawCaptureQualification;