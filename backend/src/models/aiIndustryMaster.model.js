import mongoose from 'mongoose';

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

const aiIndustryMasterSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        parentIndustry: { type: String, trim: true, required: true },
        subIndustry: { type: String, trim: true, required: true },
        keywords: { type: [String], default: [] },
        negativeKeywords: { type: [String], default: [] },
        productKeywords: { type: [String], default: [] },
        websiteKeywords: { type: [String], default: [] },
        exclusionTerms: { type: [String], default: [] },
        isActive: { type: Boolean, default: true, index: true },
        version: { type: Number, default: 1 },
        notes: { type: String, trim: true, default: '' },
        auditLog: { type: [auditEntrySchema], default: [] },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true },
);

aiIndustryMasterSchema.index({ companyId: 1, parentIndustry: 1, subIndustry: 1 }, { unique: true });

const AiIndustryMaster = mongoose.models.AiIndustryMaster
    || mongoose.model('AiIndustryMaster', aiIndustryMasterSchema);

export { AiIndustryMaster };
export default AiIndustryMaster;
