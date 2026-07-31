import mongoose from 'mongoose';

export const PROFILE_STATUSES = [
    'GENERATED',
    'LOW_CONFIDENCE',
    'MANUAL_REVIEW_REQUIRED',
    'APPROVED',
    'LOCKED',
    'OUTDATED',
    'FAILED',
];

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
        sourceType: { type: String, trim: true, default: 'system' },
    },
    { _id: false },
);

const schema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, trim: true, default: '' },
        extractedLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExtractedLead', default: null, index: true },
        discoveryJobId: { type: mongoose.Schema.Types.ObjectId, default: null },
        previewIndex: { type: Number, default: null },
        classificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiIndustryClassification', default: null },
        relevanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiLeadRelevance', default: null },
        recommendationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiProductRecommendation', default: null },
        contactIntelligenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiContactIntelligence', default: null },
        recordKey: { type: String, trim: true, default: '', index: true },
        companyName: { type: String, trim: true, default: '' },
        status: { type: String, enum: PROFILE_STATUSES, default: 'GENERATED', index: true },
        shortSummary: { type: String, trim: true, default: '' },
        standardSummary: { type: String, trim: true, default: '' },
        detailedSummary: { type: String, trim: true, default: '' },
        structuredSections: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        primaryIndustry: { type: String, trim: true, default: '' },
        secondaryIndustries: { type: [String], default: [] },
        customerType: { type: String, trim: true, default: '' },
        relevanceSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
        recommendationSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
        contactSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
        strengths: { type: [String], default: [] },
        risks: { type: [String], default: [] },
        missingInformation: { type: [String], default: [] },
        recommendedNextAction: { type: String, trim: true, default: '' },
        nextActionReason: { type: String, trim: true, default: '' },
        confidence: { type: Number, default: 0 },
        evidenceReferences: { type: [mongoose.Schema.Types.Mixed], default: [] },
        sourceUrls: { type: [String], default: [] },
        engineUsed: { type: String, trim: true, default: 'rule_based' },
        modelVersion: { type: String, trim: true, default: '' },
        fallbackUsed: { type: Boolean, default: false },
        fallbackReason: { type: String, trim: true, default: '' },
        upstreamHashes: {
            classificationUpdatedAt: { type: Date, default: null },
            relevanceUpdatedAt: { type: Date, default: null },
            recommendationUpdatedAt: { type: Date, default: null },
            contactUpdatedAt: { type: Date, default: null },
            recordUpdatedAt: { type: Date, default: null },
        },
        manuallyApproved: { type: Boolean, default: false },
        locked: { type: Boolean, default: false },
        lockedAt: { type: Date, default: null },
        lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        generatedAt: { type: Date, default: Date.now },
        reviewedAt: { type: Date, default: null },
        history: { type: [historySchema], default: [] },
        rawPayload: { type: mongoose.Schema.Types.Mixed, default: null },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true, collection: 'ai_company_intelligence_profiles' },
);

schema.index({ companyId: 1, recordKey: 1 }, { unique: true, partialFilterExpression: { isDeleted: { $ne: true }, recordKey: { $gt: '' } } });
schema.index({ companyId: 1, status: 1, updatedAt: -1 });

const AiCompanyIntelligenceProfile = mongoose.models.AiCompanyIntelligenceProfile
    || mongoose.model('AiCompanyIntelligenceProfile', schema);
export { AiCompanyIntelligenceProfile };
export default AiCompanyIntelligenceProfile;
