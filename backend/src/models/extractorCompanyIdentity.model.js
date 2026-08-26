import mongoose from 'mongoose';

const sourceRefSchema = new mongoose.Schema({
    kind: { type: String, trim: true, default: 'raw_capture' },
    rawCaptureId: { type: String, trim: true, default: '' },
    discoveryJobId: { type: String, trim: true, default: '' },
    previewIndex: { type: Number, default: null },
    source: { type: String, trim: true, default: '' },
    sourceUrl: { type: String, trim: true, default: '', maxlength: 2048 },
    title: { type: String, trim: true, default: '', maxlength: 500 },
    snippet: { type: String, trim: true, default: '', maxlength: 500 },
    keyword: { type: String, trim: true, default: '' },
    verificationStatus: { type: String, trim: true, default: 'unverified' },
    ownerDecision: { type: String, trim: true, default: '' },
    capturedAt: { type: Date, default: null },
}, { _id: false });

const schema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        financialYear: { type: String, trim: true, default: '' },
        canonicalName: { type: String, trim: true, default: '', maxlength: 300 },
        alternativeNames: { type: [String], default: [] },
        website: { type: String, trim: true, default: '', maxlength: 2048 },
        domain: { type: String, trim: true, lowercase: true, default: '', maxlength: 255 },
        primaryEmail: { type: String, trim: true, lowercase: true, default: '' },
        additionalEmails: { type: [mongoose.Schema.Types.Mixed], default: [] },
        primaryPhone: { type: String, trim: true, default: '' },
        additionalPhones: { type: [mongoose.Schema.Types.Mixed], default: [] },
        city: { type: String, trim: true, default: '' },
        state: { type: String, trim: true, default: '' },
        country: { type: String, trim: true, default: '' },
        address: { type: String, trim: true, default: '' },
        social: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        directories: { type: [mongoose.Schema.Types.Mixed], default: [] },
        sourcePlatformCount: { type: Number, default: 0 },
        evidenceRecordCount: { type: Number, default: 0 },
        platforms: { type: [String], default: [] },
        badges: { type: [String], default: [] },
        mergeConfidence: { type: Number, default: 0 },
        decision: { type: String, trim: true, default: 'single' },
        verificationSummary: { type: mongoose.Schema.Types.Mixed, default: () => ({ status: 'Unverified' }) },
        qualificationScore: { type: Number, default: null },
        qualificationCategory: { type: String, trim: true, default: '' },
        companyType: { type: String, trim: true, default: '' },
        industryTags: { type: [String], default: [] },
        keywords: { type: [String], default: [] },
        locations: { type: [String], default: [] },
        extractionRunIds: { type: [String], default: [] },
        firstDiscoveredAt: { type: Date, default: null },
        lastDiscoveredAt: { type: Date, default: null },
        lastSeenAt: { type: Date, default: null },
        foundCount: { type: Number, default: 1 },
        completeness: { type: Number, default: 0 },
        provenance: { type: [mongoose.Schema.Types.Mixed], default: [] },
        sourceRefs: { type: [sourceRefSchema], default: [] },
        mergeHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
        changeLog: { type: [mongoose.Schema.Types.Mixed], default: [] },
        outreach: { type: mongoose.Schema.Types.Mixed, default: () => ({ status: 'Not Contacted', doNotContact: false, log: [] }) },
        contactPerson: { type: mongoose.Schema.Types.Mixed, default: () => ({ name: '', designation: '', evidenceUrl: '' }) },
        crmMatchRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
        promotedExtractedLeadId: { type: mongoose.Schema.Types.ObjectId, default: null },
        mergedIntoId: { type: mongoose.Schema.Types.ObjectId, default: null },
        testOnly: { type: Boolean, default: false, index: true },
        keepSeparateKeys: { type: [String], default: [] },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true, collection: 'extractor_company_identities' },
);

schema.index({ companyId: 1, domain: 1, isDeleted: 1 });
schema.index({ companyId: 1, lastSeenAt: -1 });
schema.index({ companyId: 1, canonicalName: 1 });
schema.index({ companyId: 1, isDeleted: 1, testOnly: 1, lastSeenAt: -1 });
schema.index({ companyId: 1, crmStatus: 1 });

const ExtractorCompanyIdentity = mongoose.models.ExtractorCompanyIdentity
    || mongoose.model('ExtractorCompanyIdentity', schema);
export { ExtractorCompanyIdentity };
export default ExtractorCompanyIdentity;
