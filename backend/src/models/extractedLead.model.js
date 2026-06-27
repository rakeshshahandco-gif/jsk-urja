import mongoose from 'mongoose';

const duplicateMatchRefSchema = new mongoose.Schema(
    {
        type: { type: String, enum: ['extracted_lead', 'lead', 'customer', 'supplier'], required: true },
        refId: { type: mongoose.Schema.Types.ObjectId },
        matchScore: { type: Number, default: 0 },
        matchField: { type: String, trim: true, default: '' },
    },
    { _id: false },
);

const convertedToSchema = new mongoose.Schema(
    {
        entityType: { type: String, enum: ['lead', 'customer', 'supplier'] },
        refId: { type: mongoose.Schema.Types.ObjectId },
        convertedAt: { type: Date },
        convertedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { _id: false },
);

export const SOURCE_PLATFORMS = [
    'manual_url', 'excel_import', 'csv_import', 'web_search',
    'google_business', 'indiamart', 'justdial', 'tradeindia',
    'exportersindia', 'alibaba', 'made_in_china', 'global_sources',
    'facebook_page', 'instagram_business', 'youtube_channel',
    'linkedin_company', 'lets_extract', 'other',
];

const extractedLeadSchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, required: true, trim: true, index: true },

        companyName: { type: String, trim: true, default: '' },
        website: { type: String, trim: true, default: '' },
        normalizedDomain: { type: String, trim: true, default: '', index: true },

        sourcePlatform: { type: String, enum: SOURCE_PLATFORMS, required: true },
        sourceUrl: { type: String, trim: true, default: '' },
        sourceReference: { type: String, trim: true, default: '' },
        extractedAt: { type: Date, default: Date.now },
        lastCheckedAt: { type: Date, default: null },

        email: { type: String, trim: true, default: '' },
        phone: { type: String, trim: true, default: '' },
        mobile: { type: String, trim: true, default: '' },
        whatsappNumber: { type: String, trim: true, default: '' },
        wechatId: { type: String, trim: true, default: '' },

        address: { type: String, trim: true, default: '' },
        city: { type: String, trim: true, default: '' },
        stateProvince: { type: String, trim: true, default: '' },
        country: { type: String, trim: true, default: '' },
        pincode: { type: String, trim: true, default: '' },

        businessDescription: { type: String, trim: true, default: '' },
        natureOfBusiness: { type: String, trim: true, default: '' },
        productCategories: [{ type: String, trim: true }],
        keywords: [{ type: String, trim: true }],
        certifications: [{ type: String, trim: true }],
        languages: [{ type: String, trim: true }],
        socialLinks: {
            facebook: { type: String, trim: true, default: '' },
            instagram: { type: String, trim: true, default: '' },
            linkedin: { type: String, trim: true, default: '' },
            youtube: { type: String, trim: true, default: '' },
            twitter: { type: String, trim: true, default: '' },
            alibaba: { type: String, trim: true, default: '' },
        },

        confidenceScore: { type: Number, default: 0, min: 0, max: 100 },
        leadScore: { type: Number, default: 0, min: 0, max: 100 },
        aiSummary: { type: String, trim: true, default: '' },
        aiClassification: { type: String, trim: true, default: '' },
        rawExtractedData: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

        status: {
            type: String,
            enum: ['draft', 'reviewed', 'approved', 'converted', 'rejected', 'duplicate'],
            default: 'draft',
            index: true,
        },
        duplicateStatus: {
            type: String,
            enum: ['none', 'possible_duplicate', 'confirmed_duplicate'],
            default: 'none',
        },
        duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'ExtractedLead', default: null },
        duplicateMatchRefs: [duplicateMatchRefSchema],

        convertedTo: { type: convertedToSchema, default: null },

        searchJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExtractorSearchJob' },
        importBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExtractorImportBatch' },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        rejectionReason: { type: String, trim: true, default: '' },
        notes: { type: String, trim: true, default: '' },
    },
    { timestamps: true },
);

extractedLeadSchema.index({ companyId: 1, status: 1, createdAt: -1 });
extractedLeadSchema.index({ companyId: 1, normalizedDomain: 1 });

const ExtractedLead = mongoose.model('ExtractedLead', extractedLeadSchema);
export { ExtractedLead };
export default ExtractedLead;
