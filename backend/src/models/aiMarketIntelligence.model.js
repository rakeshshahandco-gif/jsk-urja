import mongoose from 'mongoose';

export const MARKET_INTEL_TYPES = ['CLUSTER', 'COVERAGE', 'WHITE_SPACE', 'EXPANSION_SUGGESTION'];
export const MARKET_INTEL_STATUSES = ['GENERATED', 'LOW_CONFIDENCE', 'MANUAL_REVIEW_REQUIRED', 'APPROVED', 'LOCKED', 'OUTDATED', 'FAILED'];
export const COVERAGE_STATUSES = ['KNOWN_COVERAGE', 'PARTIAL_COVERAGE', 'UNKNOWN_MARKET_SIZE', 'INSUFFICIENT_DATA'];

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

const schema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, trim: true, default: '' },
        intelType: { type: String, enum: MARKET_INTEL_TYPES, required: true, index: true },
        recordKey: { type: String, trim: true, default: '', index: true },
        status: { type: String, enum: MARKET_INTEL_STATUSES, default: 'GENERATED', index: true },
        title: { type: String, trim: true, default: '' },
        summary: { type: String, trim: true, default: '' },
        coverageStatus: { type: String, enum: COVERAGE_STATUSES, default: 'INSUFFICIENT_DATA' },
        metrics: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        filters: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        recommendations: { type: [mongoose.Schema.Types.Mixed], default: [] },
        evidence: { type: [mongoose.Schema.Types.Mixed], default: [] },
        priority: { type: String, trim: true, default: 'MEDIUM' },
        confidence: { type: Number, default: 0 },
        engineUsed: { type: String, trim: true, default: 'rule_based' },
        modelVersion: { type: String, trim: true, default: '' },
        settingsVersion: { type: String, trim: true, default: '' },
        manuallyApproved: { type: Boolean, default: false },
        locked: { type: Boolean, default: false },
        lockedAt: { type: Date, default: null },
        lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        generatedAt: { type: Date, default: Date.now },
        reviewedAt: { type: Date, default: null },
        history: { type: [historySchema], default: [] },
        rawPayload: { type: mongoose.Schema.Types.Mixed, default: null },
        noAutoPaidProvider: { type: Boolean, default: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true, collection: 'ai_market_intelligence' },
);

schema.index({ companyId: 1, intelType: 1, recordKey: 1 }, { unique: true, partialFilterExpression: { isDeleted: { $ne: true }, recordKey: { $gt: '' } } });

const AiMarketIntelligence = mongoose.models.AiMarketIntelligence || mongoose.model('AiMarketIntelligence', schema);
export { AiMarketIntelligence };
export default AiMarketIntelligence;
