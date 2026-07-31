import mongoose from 'mongoose';

export const LEAD_SCORE_STATUSES = [
    'SCORED',
    'LOW_CONFIDENCE',
    'MANUAL_REVIEW_REQUIRED',
    'APPROVED',
    'LOCKED',
    'OUTDATED',
    'REJECTED_MANUALLY',
    'FAILED',
];

export const LEAD_PRIORITIES = [
    'CRITICAL',
    'HIGH',
    'MEDIUM',
    'LOW',
    'NO_PRIORITY',
    'MANUAL_REVIEW_REQUIRED',
];

export const LEAD_GRADES = ['A+', 'A', 'B', 'C', 'D', 'REJECT'];

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
        overrideType: { type: String, trim: true, default: '' },
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
        classificationId: { type: mongoose.Schema.Types.ObjectId, default: null },
        relevanceId: { type: mongoose.Schema.Types.ObjectId, default: null },
        recommendationId: { type: mongoose.Schema.Types.ObjectId, default: null },
        contactIntelligenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
        profileId: { type: mongoose.Schema.Types.ObjectId, default: null },
        recordKey: { type: String, trim: true, default: '', index: true },
        companyName: { type: String, trim: true, default: '' },
        status: { type: String, enum: LEAD_SCORE_STATUSES, default: 'SCORED', index: true },
        dimensionScores: { type: [mongoose.Schema.Types.Mixed], default: [] },
        rawScore: { type: Number, default: 0 },
        weightedScore: { type: Number, default: 0 },
        finalScore: { type: Number, default: 0, index: true },
        confidence: { type: Number, default: 0 },
        priority: { type: String, enum: LEAD_PRIORITIES, default: 'MEDIUM', index: true },
        grade: { type: String, enum: LEAD_GRADES, default: 'C', index: true },
        positiveSignals: { type: [String], default: [] },
        negativeSignals: { type: [String], default: [] },
        penalties: { type: [mongoose.Schema.Types.Mixed], default: [] },
        boosts: { type: [mongoose.Schema.Types.Mixed], default: [] },
        recommendation: { type: String, trim: true, default: '' },
        recommendationReason: { type: String, trim: true, default: '' },
        reviewReason: { type: String, trim: true, default: '' },
        engineUsed: { type: String, trim: true, default: 'rule_based' },
        modelVersion: { type: String, trim: true, default: '' },
        settingsVersion: { type: String, trim: true, default: '' },
        fallbackUsed: { type: Boolean, default: false },
        fallbackReason: { type: String, trim: true, default: '' },
        preAiScore: { type: Number, default: null },
        postAiScore: { type: Number, default: null },
        aiAdjustment: { type: mongoose.Schema.Types.Mixed, default: null },
        evidenceReferences: { type: [mongoose.Schema.Types.Mixed], default: [] },
        sourceUrls: { type: [String], default: [] },
        inputSnapshots: { type: mongoose.Schema.Types.Mixed, default: null },
        upstreamHashes: {
            classificationUpdatedAt: { type: Date, default: null },
            relevanceUpdatedAt: { type: Date, default: null },
            recommendationUpdatedAt: { type: Date, default: null },
            contactUpdatedAt: { type: Date, default: null },
            profileUpdatedAt: { type: Date, default: null },
            settingsVersion: { type: String, trim: true, default: '' },
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
        noAutoCrmCreate: { type: Boolean, default: true },
        noAutoCommunications: { type: Boolean, default: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true, collection: 'ai_lead_scores' },
);

schema.index({ companyId: 1, recordKey: 1 }, { unique: true, partialFilterExpression: { isDeleted: { $ne: true }, recordKey: { $gt: '' } } });
schema.index({ companyId: 1, finalScore: -1, updatedAt: -1 });

const AiLeadScore = mongoose.models.AiLeadScore || mongoose.model('AiLeadScore', schema);
export { AiLeadScore };
export default AiLeadScore;
