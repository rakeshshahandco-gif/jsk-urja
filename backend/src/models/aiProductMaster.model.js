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

const aiProductMasterSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        productName: { type: String, trim: true, required: true },
        productCategory: { type: String, trim: true, default: '' },
        parentIndustry: { type: String, trim: true, default: '' },
        subIndustry: { type: String, trim: true, default: '' },
        applicableCustomerTypes: { type: [String], default: [] },
        keywords: { type: [String], default: [] },
        negativeKeywords: { type: [String], default: [] },
        positiveSignals: { type: [String], default: [] },
        productBenefits: { type: [String], default: [] },
        applications: { type: [String], default: [] },
        brochureUrl: { type: String, trim: true, default: '' },
        catalogUrl: { type: String, trim: true, default: '' },
        datasheetUrl: { type: String, trim: true, default: '' },
        videoUrl: { type: String, trim: true, default: '' },
        websiteUrl: { type: String, trim: true, default: '' },
        priority: { type: String, trim: true, default: 'medium' },
        salesNotes: { type: String, trim: true, default: '' },
        salesStrategies: { type: [String], default: [] },
        upsellOf: { type: [String], default: [] },
        crossSellWith: { type: [String], default: [] },
        bundleWith: { type: [String], default: [] },
        isActive: { type: Boolean, default: true, index: true },
        version: { type: Number, default: 1 },
        notes: { type: String, trim: true, default: '' },
        auditLog: { type: [auditEntrySchema], default: [] },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, collection: 'ai_product_masters' },
);

aiProductMasterSchema.index({ companyId: 1, productName: 1 }, { unique: true });
aiProductMasterSchema.index({ companyId: 1, parentIndustry: 1, subIndustry: 1, isActive: 1 });

const AiProductMaster = mongoose.models.AiProductMaster
    || mongoose.model('AiProductMaster', aiProductMasterSchema);
export { AiProductMaster };
export default AiProductMaster;
