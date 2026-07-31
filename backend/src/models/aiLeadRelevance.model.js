import mongoose from 'mongoose';

export const RELEVANCE_STATUSES = ['RELEVANT', 'POSSIBLY_RELEVANT', 'IRRELEVANT', 'MANUAL_REVIEW'];

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

const aiLeadRelevanceSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, trim: true, default: '' },
        classificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AiIndustryClassification', default: null, index: true },
        extractedLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExtractedLead', default: null, index: true },
        discoveryJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiscoveryJob', default: null },
        previewIndex: { type: Number, default: null },
        recordKey: { type: String, trim: true, default: '', index: true },
        companyName: { type: String, trim: true, default: '' },
        status: { type: String, enum: RELEVANCE_STATUSES, default: 'MANUAL_REVIEW', index: true },
        relevanceScore: { type: Number, default: 0, min: 0, max: 100 },
        explanation: { type: String, trim: true, default: '' },
        matchingProducts: { type: [String], default: [] },
        conflictingKeywords: { type: [String], default: [] },
        exclusionReason: { type: String, trim: true, default: '' },
        searchKeyword: { type: String, trim: true, default: '' },
        selectedIndustry: { type: String, trim: true, default: '' },
        selectedProduct: { type: String, trim: true, default: '' },
        selectedLocation: { type: String, trim: true, default: '' },
        classificationStatus: { type: String, trim: true, default: '' },
        primaryIndustry: { type: String, trim: true, default: '' },
        parentIndustry: { type: String, trim: true, default: '' },
        subIndustry: { type: String, trim: true, default: '' },
        signals: { type: [mongoose.Schema.Types.Mixed], default: [] },
        evidenceSnippets: { type: [String], default: [] },
        excluded: { type: Boolean, default: false, index: true },
        excludedAt: { type: Date, default: null },
        excludedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        restoredAt: { type: Date, default: null },
        restoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        engineVersion: { type: String, trim: true, default: 'lead-relevance-v1' },
        history: { type: [historySchema], default: [] },
        rawPayload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        isDeleted: { type: Boolean, default: false },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, collection: 'ai_lead_relevance' },
);

aiLeadRelevanceSchema.index({ companyId: 1, status: 1, excluded: 1, createdAt: -1 });
aiLeadRelevanceSchema.index({ companyId: 1, recordKey: 1 });

const AiLeadRelevance = mongoose.models.AiLeadRelevance
    || mongoose.model('AiLeadRelevance', aiLeadRelevanceSchema);
export { AiLeadRelevance };
export default AiLeadRelevance;
