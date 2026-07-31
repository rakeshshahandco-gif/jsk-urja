import mongoose from 'mongoose';
import {
    BUSINESS_TYPES,
    ENRICHMENT_JOB_STATUSES,
    ENRICHMENT_STATUSES,
} from '../services/dataExtractor/searchCampaign/rawCaptureEnrichment/constants.js';

const evidenceSchema = new mongoose.Schema(
    {
        field: { type: String, trim: true, maxlength: 80 },
        value: { type: String, trim: true, maxlength: 1000 },
        sourceUrl: { type: String, trim: true, maxlength: 2048 },
        note: { type: String, trim: true, maxlength: 500 },
    },
    { _id: false },
);

const phoneSchema = new mongoose.Schema(
    {
        original: { type: String, trim: true, maxlength: 80 },
        normalized: { type: String, trim: true, maxlength: 40 },
        kind: { type: String, enum: ['general', 'mobile', 'whatsapp', 'toll_free', 'unknown'], default: 'unknown' },
        sourceUrl: { type: String, trim: true, maxlength: 2048 },
        labelledWhatsApp: { type: Boolean, default: false },
        confidence: {
            type: String,
            enum: [
                'verified_from_tel_link',
                'verified_from_structured_data',
                'visible_labelled_phone',
                'possible_phone',
                'rejected_invalid',
                '',
            ],
            default: '',
        },
        originalText: { type: String, trim: true, maxlength: 200 },
        reviewRequired: { type: Boolean, default: false },
        rejectReason: { type: String, trim: true, maxlength: 120 },
    },
    { _id: false },
);

const emailSchema = new mongoose.Schema(
    {
        value: { type: String, trim: true, lowercase: true, maxlength: 200 },
        kind: { type: String, enum: ['sales', 'enquiry', 'support', 'general', 'personal_business', 'unknown'], default: 'unknown' },
        sourceUrl: { type: String, trim: true, maxlength: 2048 },
    },
    { _id: false },
);

const addressSchema = new mongoose.Schema(
    {
        raw: { type: String, trim: true, maxlength: 1000 },
        city: { type: String, trim: true, maxlength: 120 },
        state: { type: String, trim: true, maxlength: 120 },
        country: { type: String, trim: true, maxlength: 120 },
        pinCode: { type: String, trim: true, maxlength: 20 },
        type: { type: String, trim: true, maxlength: 80, default: 'Office' },
        evidenceLabel: { type: String, trim: true, maxlength: 120 },
        confidence: { type: String, trim: true, maxlength: 40, default: '' },
        sourceUrl: { type: String, trim: true, maxlength: 2048 },
    },
    { _id: false },
);

const contactPersonSchema = new mongoose.Schema(
    {
        name: { type: String, trim: true, maxlength: 200 },
        designation: { type: String, trim: true, maxlength: 200 },
        sourceUrl: { type: String, trim: true, maxlength: 2048 },
    },
    { _id: false },
);

const socialSchema = new mongoose.Schema(
    {
        url: { type: String, trim: true, maxlength: 2048 },
        handle: { type: String, trim: true, maxlength: 200 },
        pageId: { type: String, trim: true, maxlength: 120 },
        pageName: { type: String, trim: true, maxlength: 200 },
        matchConfidence: { type: String, enum: ['verified', 'possible_match', 'review_required', ''], default: '' },
        evidence: { type: [String], default: [] },
        sourceUrl: { type: String, trim: true, maxlength: 2048 },
    },
    { _id: false },
);

const rawCaptureEnrichmentSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SearchCampaign', required: true, index: true },
        sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssistedCaptureSession', default: null, index: true },
        canonicalDomain: { type: String, required: true, trim: true, lowercase: true, maxlength: 255, index: true },
        websiteUrl: { type: String, trim: true, default: '', maxlength: 2048 },
        isDirectorySource: { type: Boolean, default: false },
        directoryPlatform: { type: String, trim: true, default: '', maxlength: 80 },
        directoryProfileUrl: { type: String, trim: true, default: '', maxlength: 2048 },
        rawCaptureIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RawCapture' }],
        companyName: { type: String, trim: true, default: '', maxlength: 300 },
        legalOrDisplayedName: { type: String, trim: true, default: '', maxlength: 300 },
        contactPersons: { type: [contactPersonSchema], default: [] },
        phones: { type: [phoneSchema], default: [] },
        whatsappNumbers: { type: [phoneSchema], default: [] },
        emails: { type: [emailSchema], default: [] },
        addresses: { type: [addressSchema], default: [] },
        city: { type: String, trim: true, default: '', maxlength: 120 },
        state: { type: String, trim: true, default: '', maxlength: 120 },
        country: { type: String, trim: true, default: '', maxlength: 120 },
        facebook: { type: socialSchema, default: () => ({}) },
        instagram: { type: socialSchema, default: () => ({}) },
        linkedin: { type: socialSchema, default: () => ({}) },
        youtube: { type: socialSchema, default: () => ({}) },
        productsServices: { type: [String], default: [] },
        businessType: { type: String, enum: BUSINESS_TYPES, default: 'unknown' },
        manufacturerEvidence: { type: String, trim: true, default: '', maxlength: 1000 },
        gstin: { type: String, trim: true, default: '', maxlength: 20 },
        gstinSourceUrl: { type: String, trim: true, default: '', maxlength: 2048 },
        rejectedPhones: { type: [mongoose.Schema.Types.Mixed], default: [] },
        sourceEvidence: { type: [evidenceSchema], default: [] },
        pagesVisited: { type: [String], default: [] },
        enrichmentStatus: { type: String, enum: ENRICHMENT_STATUSES, default: 'queued', index: true },
        confidence: { type: Number, default: 0, min: 0, max: 100 },
        reviewStatus: { type: String, enum: ['unreviewed', 'approved', 'rejected', 'needs_edit'], default: 'unreviewed' },
        ownerOverrides: { type: mongoose.Schema.Types.Mixed, default: {} },
        missingFields: { type: [String], default: [] },
        conflictingValues: { type: [String], default: [] },
        errorReason: { type: String, trim: true, default: '', maxlength: 500 },
        lastEnrichedAt: { type: Date, default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, collection: 'raw_capture_enrichments' },
);

rawCaptureEnrichmentSchema.index(
    { companyId: 1, campaignId: 1, canonicalDomain: 1 },
    { unique: true, name: 'uniq_raw_capture_enrichment_domain' },
);
rawCaptureEnrichmentSchema.index({ companyId: 1, sessionId: 1, enrichmentStatus: 1 });

const enrichmentJobSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SearchCampaign', required: true, index: true },
        sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssistedCaptureSession', default: null, index: true },
        mode: { type: String, enum: ['selected', 'all_unverified', 'retry_failed'], default: 'all_unverified' },
        selectedRawCaptureIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RawCapture' }],
        status: { type: String, enum: ENRICHMENT_JOB_STATUSES, default: 'queued', index: true },
        stopRequested: { type: Boolean, default: false },
        totalDomains: { type: Number, default: 0 },
        processedDomains: { type: Number, default: 0 },
        completedCount: { type: Number, default: 0 },
        partialCount: { type: Number, default: 0 },
        failedCount: { type: Number, default: 0 },
        blockedCount: { type: Number, default: 0 },
        reviewRequiredCount: { type: Number, default: 0 },
        withPhone: { type: Number, default: 0 },
        withEmail: { type: Number, default: 0 },
        withWhatsApp: { type: Number, default: 0 },
        withFacebook: { type: Number, default: 0 },
        withInstagram: { type: Number, default: 0 },
        currentDomain: { type: String, trim: true, default: '' },
        lastError: { type: String, trim: true, default: '', maxlength: 500 },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, collection: 'raw_capture_enrichment_jobs' },
);

enrichmentJobSchema.index({ companyId: 1, sessionId: 1, createdAt: -1 });

export const RawCaptureEnrichment = mongoose.models.RawCaptureEnrichment
    || mongoose.model('RawCaptureEnrichment', rawCaptureEnrichmentSchema);
export const RawCaptureEnrichmentJob = mongoose.models.RawCaptureEnrichmentJob
    || mongoose.model('RawCaptureEnrichmentJob', enrichmentJobSchema);
export default RawCaptureEnrichment;