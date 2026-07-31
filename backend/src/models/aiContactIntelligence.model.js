import mongoose from 'mongoose';

export const CONTACT_ANALYSIS_STATUSES = [
    'CONTACT_FOUND',
    'GENERIC_CONTACT_ONLY',
    'MULTIPLE_CONTACTS',
    'LOW_CONFIDENCE',
    'NO_PUBLIC_CONTACT',
    'MANUAL_REVIEW_REQUIRED',
    'INVALID',
    'FAILED',
];

export const VERIFICATION_STATUSES = [
    'SOURCE_VERIFIED',
    'MULTIPLE_SOURCE_CONFIRMED',
    'PUBLIC_UNVERIFIED',
    'IMPORTED_UNVERIFIED',
    'MANUALLY_VERIFIED',
    'INFERRED_UNVERIFIED',
    'INVALID',
    'UNKNOWN',
];

export const DUPLICATE_STATUSES = [
    'EXACT_DUPLICATE',
    'POSSIBLE_DUPLICATE',
    'RELATED_CONTACT',
    'UNIQUE',
    'MANUAL_REVIEW_REQUIRED',
];

const provenanceSchema = new mongoose.Schema(
    {
        field: { type: String, trim: true, default: '' },
        value: { type: String, trim: true, default: '' },
        sourceType: { type: String, trim: true, default: '' },
        sourceUrl: { type: String, trim: true, default: '' },
        collectedAt: { type: Date, default: Date.now },
        confidence: { type: Number, default: 0 },
        verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: 'PUBLIC_UNVERIFIED' },
    },
    { _id: false },
);

const historySchema = new mongoose.Schema(
    {
        at: { type: Date, default: Date.now },
        action: { type: String, trim: true, default: '' },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        previousStatus: { type: String, trim: true, default: '' },
        resultingStatus: { type: String, trim: true, default: '' },
        previous: { type: mongoose.Schema.Types.Mixed, default: null },
        next: { type: mongoose.Schema.Types.Mixed, default: null },
        reason: { type: String, trim: true, default: '' },
    },
    { _id: false },
);

const contactItemSchema = new mongoose.Schema(
    {
        contactKey: { type: String, trim: true, default: '' },
        contactName: { type: String, trim: true, default: '' },
        firstName: { type: String, trim: true, default: '' },
        lastName: { type: String, trim: true, default: '' },
        designation: { type: String, trim: true, default: '' },
        department: { type: String, trim: true, default: '' },
        contactRoleCategory: { type: String, trim: true, default: 'Unknown' },
        seniority: { type: String, trim: true, default: 'Unknown' },
        email: { type: String, trim: true, default: '' },
        emailType: { type: String, trim: true, default: 'unknown' },
        emailCategory: { type: String, trim: true, default: 'unknown' },
        isGenericEmail: { type: Boolean, default: false },
        isNamedEmail: { type: Boolean, default: false },
        phone: { type: String, trim: true, default: '' },
        phoneNormalized: { type: String, trim: true, default: '' },
        phoneType: { type: String, trim: true, default: 'Unknown' },
        phoneCategory: { type: String, trim: true, default: 'Unknown' },
        countryCode: { type: String, trim: true, default: '' },
        extension: { type: String, trim: true, default: '' },
        whatsappCapable: { type: Boolean, default: false },
        profileUrl: { type: String, trim: true, default: '' },
        sourceUrl: { type: String, trim: true, default: '' },
        sourceType: { type: String, trim: true, default: '' },
        sourceTimestamp: { type: Date, default: null },
        verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: 'PUBLIC_UNVERIFIED' },
        confidence: { type: Number, default: 0 },
        decisionMakerScore: { type: Number, default: 0 },
        contactQualityScore: { type: Number, default: 0 },
        whyRecommended: { type: String, trim: true, default: '' },
        matchedRoleSignals: { type: [String], default: [] },
        opportunityRelevance: { type: String, trim: true, default: '' },
        availableChannels: { type: [String], default: [] },
        evidence: { type: [String], default: [] },
        warnings: { type: [String], default: [] },
        provenance: { type: [provenanceSchema], default: [] },
        isPrimaryContact: { type: Boolean, default: false },
        isGenericCompanyContact: { type: Boolean, default: false },
        isDecisionMakerCandidate: { type: Boolean, default: false },
        isManuallyApproved: { type: Boolean, default: false },
        isLocked: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
        duplicateStatus: { type: String, enum: DUPLICATE_STATUSES, default: 'UNIQUE' },
        duplicateOfKey: { type: String, trim: true, default: '' },
        rankingReasons: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },
    { _id: false },
);

const aiContactIntelligenceSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, trim: true, default: '' },
        extractedLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExtractedLead', default: null, index: true },
        discoveryJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiscoveryJob', default: null },
        previewIndex: { type: Number, default: null },
        classificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiIndustryClassification', default: null },
        relevanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiLeadRelevance', default: null },
        recommendationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiProductRecommendation', default: null },
        recordKey: { type: String, trim: true, default: '', index: true },
        companyName: { type: String, trim: true, default: '' },
        status: { type: String, enum: CONTACT_ANALYSIS_STATUSES, default: 'NO_PUBLIC_CONTACT', index: true },
        parentIndustry: { type: String, trim: true, default: '' },
        customerType: { type: String, trim: true, default: '' },
        opportunityType: { type: String, trim: true, default: '' },
        recommendedProduct: { type: String, trim: true, default: '' },
        contacts: { type: [contactItemSchema], default: [] },
        primaryContact: { type: contactItemSchema, default: null },
        secondaryContacts: { type: [contactItemSchema], default: [] },
        genericFallbackContact: { type: contactItemSchema, default: null },
        decisionMakerScore: { type: Number, default: 0 },
        contactQualityScore: { type: Number, default: 0 },
        confidence: { type: Number, default: 0 },
        whyRecommended: { type: String, trim: true, default: '' },
        warnings: { type: [String], default: [] },
        engineUsed: { type: String, trim: true, default: 'rule_based' },
        modelVersion: { type: String, trim: true, default: 'contact-intelligence-v1' },
        analysisTimestamp: { type: Date, default: Date.now },
        locked: { type: Boolean, default: false, index: true },
        lockedAt: { type: Date, default: null },
        lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        manuallyApproved: { type: Boolean, default: false },
        history: { type: [historySchema], default: [] },
        mergeHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
        rawPayload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        isDeleted: { type: Boolean, default: false },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, collection: 'ai_contact_intelligence' },
);

aiContactIntelligenceSchema.index({ companyId: 1, status: 1, createdAt: -1 });
aiContactIntelligenceSchema.index({ companyId: 1, recordKey: 1 });

const AiContactIntelligence = mongoose.models.AiContactIntelligence
    || mongoose.model('AiContactIntelligence', aiContactIntelligenceSchema);
export { AiContactIntelligence };
export default AiContactIntelligence;
