import mongoose from 'mongoose';

export const CLASSIFICATION_STATUSES = [
    'CLASSIFIED',
    'LOW_CONFIDENCE',
    'MULTIPLE_POSSIBILITIES',
    'IRRELEVANT',
    'MANUAL_REVIEW_REQUIRED',
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
        engineUsed: { type: String, trim: true, default: '' },
        confidence: { type: Number, default: 0 },
        evidence: { type: [mongoose.Schema.Types.Mixed], default: [] },
        reason: { type: String, trim: true, default: '' },
    },
    { _id: false },
);

const aiIndustryClassificationSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, trim: true, default: '' },
        extractedLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExtractedLead', default: null, index: true },
        discoveryJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiscoveryJob', default: null, index: true },
        previewIndex: { type: Number, default: null },
        recordKey: { type: String, trim: true, default: '', index: true },
        companyName: { type: String, trim: true, default: '' },
        status: { type: String, enum: CLASSIFICATION_STATUSES, default: 'MANUAL_REVIEW_REQUIRED', index: true },
        primaryIndustry: { type: String, trim: true, default: '' },
        primaryIndustryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiIndustryMaster', default: null },
        parentIndustry: { type: String, trim: true, default: '' },
        subIndustry: { type: String, trim: true, default: '' },
        secondaryIndustries: { type: [mongoose.Schema.Types.Mixed], default: [] },
        customerType: { type: String, trim: true, default: '' },
        customerTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiCustomerTypeMaster', default: null },
        confidenceScore: { type: Number, default: 0, min: 0, max: 100 },
        engineUsed: { type: String, trim: true, default: 'rule_based' },
        modelProvider: { type: String, trim: true, default: '' },
        modelVersion: { type: String, trim: true, default: '' },
        rulesMatched: { type: [mongoose.Schema.Types.Mixed], default: [] },
        positiveKeywordsFound: { type: [String], default: [] },
        negativeKeywordsFound: { type: [String], default: [] },
        productSignals: { type: [String], default: [] },
        websiteSignals: { type: [String], default: [] },
        evidenceSnippets: { type: [String], default: [] },
        evidenceSourceUrls: { type: [String], default: [] },
        opportunities: { type: [mongoose.Schema.Types.Mixed], default: [] },
        candidates: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        analysisTimestamp: { type: Date, default: Date.now },
        manualReviewReason: { type: String, trim: true, default: '' },
        fallbackUsed: { type: Boolean, default: false },
        locked: { type: Boolean, default: false, index: true },
        lockedAt: { type: Date, default: null },
        lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        manuallyApproved: { type: Boolean, default: false, index: true },
        applied: { type: Boolean, default: false },
        history: { type: [historySchema], default: [] },
        rawPayload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        isDeleted: { type: Boolean, default: false },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, collection: 'ai_industry_classifications' },
);

aiIndustryClassificationSchema.index({ companyId: 1, status: 1, createdAt: -1 });
aiIndustryClassificationSchema.index({ companyId: 1, extractedLeadId: 1 });
aiIndustryClassificationSchema.index({ companyId: 1, discoveryJobId: 1, previewIndex: 1 });

const AiIndustryClassification = mongoose.models.AiIndustryClassification
    || mongoose.model('AiIndustryClassification', aiIndustryClassificationSchema);
export { AiIndustryClassification };
export default AiIndustryClassification;
