import mongoose from 'mongoose';

const opportunityItemSchema = new mongoose.Schema(
    {
        productName: { type: String, trim: true, required: true },
        priority: { type: String, trim: true, default: 'medium' },
        salesStrategy: { type: String, trim: true, default: '' },
        positiveSignals: { type: [String], default: [] },
        negativeSignals: { type: [String], default: [] },
        recommendedFollowUp: { type: String, trim: true, default: '' },
        recommendedSalesperson: { type: String, trim: true, default: '' },
    },
    { _id: false },
);

const auditEntrySchema = new mongoose.Schema(
    {
        at: { type: Date, default: Date.now },
        action: { type: String, trim: true, default: '' },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        note: { type: String, trim: true, default: '' },
        snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    { _id: false },
);

const aiOpportunityMapSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        parentIndustry: { type: String, trim: true, required: true },
        subIndustry: { type: String, trim: true, default: '' },
        customerType: { type: String, trim: true, default: '' },
        isActive: { type: Boolean, default: true, index: true },
        version: { type: Number, default: 1 },
        opportunityItems: { type: [opportunityItemSchema], default: [] },
        notes: { type: String, trim: true, default: '' },
        auditLog: { type: [auditEntrySchema], default: [] },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true },
);

aiOpportunityMapSchema.index({ companyId: 1, parentIndustry: 1, subIndustry: 1, customerType: 1 }, { unique: true });

const AiOpportunityMap = mongoose.models.AiOpportunityMap
    || mongoose.model('AiOpportunityMap', aiOpportunityMapSchema);

export { AiOpportunityMap };
export default AiOpportunityMap;
