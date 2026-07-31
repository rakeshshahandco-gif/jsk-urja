import mongoose from 'mongoose';

export const RECOMMENDATION_STATUSES = [
    'RECOMMENDED',
    'ACCEPTED',
    'REJECTED',
    'MANUAL_REVIEW',
    'LOW_CONFIDENCE',
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
    },
    { _id: false },
);

const productRecItemSchema = new mongoose.Schema(
    {
        role: { type: String, trim: true, default: 'primary' }, // primary|secondary|alternative|cross_sell|upsell|bundle
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiProductMaster', default: null },
        productName: { type: String, trim: true, default: '' },
        productCategory: { type: String, trim: true, default: '' },
        priority: { type: String, trim: true, default: 'medium' },
        opportunityScore: { type: Number, default: 0 },
        confidence: { type: Number, default: 0 },
        reason: { type: String, trim: true, default: '' },
        salesStrategy: { type: String, trim: true, default: '' },
        brochureUrl: { type: String, trim: true, default: '' },
        catalogUrl: { type: String, trim: true, default: '' },
        datasheetUrl: { type: String, trim: true, default: '' },
        matchingKeywords: { type: [String], default: [] },
        matchingProducts: { type: [String], default: [] },
        conflictingSignals: { type: [String], default: [] },
        evidence: { type: [String], default: [] },
        rulesMatched: { type: [mongoose.Schema.Types.Mixed], default: [] },
        followUpAction: { type: String, trim: true, default: '' },
    },
    { _id: false },
);

const aiProductRecommendationSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, trim: true, default: '' },
        classificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiIndustryClassification', default: null, index: true },
        relevanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiLeadRelevance', default: null, index: true },
        extractedLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExtractedLead', default: null, index: true },
        discoveryJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiscoveryJob', default: null },
        previewIndex: { type: Number, default: null },
        recordKey: { type: String, trim: true, default: '', index: true },
        companyName: { type: String, trim: true, default: '' },
        status: { type: String, enum: RECOMMENDATION_STATUSES, default: 'RECOMMENDED', index: true },
        parentIndustry: { type: String, trim: true, default: '' },
        subIndustry: { type: String, trim: true, default: '' },
        customerType: { type: String, trim: true, default: '' },
        searchKeyword: { type: String, trim: true, default: '' },
        relevanceScore: { type: Number, default: 0 },
        classificationConfidence: { type: Number, default: 0 },
        opportunityScore: { type: Number, default: 0 },
        confidence: { type: Number, default: 0 },
        primaryRecommendation: { type: productRecItemSchema, default: null },
        secondaryRecommendations: { type: [productRecItemSchema], default: [] },
        alternativeProducts: { type: [productRecItemSchema], default: [] },
        crossSellOpportunities: { type: [productRecItemSchema], default: [] },
        upsellOpportunities: { type: [productRecItemSchema], default: [] },
        bundleRecommendations: { type: [productRecItemSchema], default: [] },
        recommendedSalesStrategy: { type: String, trim: true, default: '' },
        recommendedFollowUpAction: { type: String, trim: true, default: '' },
        engineUsed: { type: String, trim: true, default: 'rule_based' },
        modelProvider: { type: String, trim: true, default: '' },
        modelVersion: { type: String, trim: true, default: '' },
        fallbackUsed: { type: Boolean, default: false },
        analysisTimestamp: { type: Date, default: Date.now },
        locked: { type: Boolean, default: false, index: true },
        lockedAt: { type: Date, default: null },
        lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        manuallyApproved: { type: Boolean, default: false },
        history: { type: [historySchema], default: [] },
        rawPayload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        isDeleted: { type: Boolean, default: false },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, collection: 'ai_product_recommendations' },
);

aiProductRecommendationSchema.index({ companyId: 1, status: 1, createdAt: -1 });
aiProductRecommendationSchema.index({ companyId: 1, recordKey: 1 });

const AiProductRecommendation = mongoose.models.AiProductRecommendation
    || mongoose.model('AiProductRecommendation', aiProductRecommendationSchema);
export { AiProductRecommendation };
export default AiProductRecommendation;
