import mongoose from 'mongoose';
import {
    SEARCH_CAMPAIGN_REQUIRED_CONTACT_FIELDS,
    SEARCH_CAMPAIGN_SOURCES,
    SEARCH_CAMPAIGN_STATUSES,
} from '../services/dataExtractor/searchCampaign/constants.js';

const searchCampaignSchema = new mongoose.Schema(
    {
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            required: true,
            index: true,
        },
        name: { type: String, required: true, trim: true, maxlength: 160 },
        nameNormalized: { type: String, trim: true, default: '', index: true },
        description: { type: String, trim: true, default: '', maxlength: 2000 },
        targetIndustry: { type: String, required: true, trim: true, maxlength: 200 },
        relatedIndustries: { type: [String], default: [] },
        targetProducts: { type: [String], default: [] },
        businessTypes: { type: [String], default: [] },
        country: { type: String, trim: true, default: '', maxlength: 200 },
        state: { type: String, trim: true, default: '', maxlength: 200 },
        city: { type: String, trim: true, default: '', maxlength: 200 },
        locationScope: {
            type: String,
            trim: true,
            default: '',
            maxlength: 40,
        },
        relatedKeywords: { type: [String], default: [] },
        searchMarket: {
            type: String,
            trim: true,
            default: 'india_global_web',
            maxlength: 60,
        },
        selectedSources: { type: [String], default: [] },
        worldwide: { type: Boolean, default: false },
        expandCities: { type: [String], default: [] },
        expandStates: { type: [String], default: [] },
        includeKeywords: { type: [String], default: [] },
        excludeKeywords: { type: [String], default: [] },
        sources: {
            type: [{ type: String, enum: SEARCH_CAMPAIGN_SOURCES }],
            default: [],
        },
        minimumQualificationScore: {
            type: Number,
            default: 60,
            min: 0,
            max: 100,
        },
        requiredContactFields: {
            type: [{ type: String, enum: SEARCH_CAMPAIGN_REQUIRED_CONTACT_FIELDS }],
            default: [],
        },
        status: {
            type: String,
            enum: SEARCH_CAMPAIGN_STATUSES,
            default: 'draft',
            index: true,
        },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        createdByName: { type: String, default: '', trim: true, maxlength: 160 },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        dataRetentionStatus: { type: String, default: '', trim: true, maxlength: 40 },
        dataDeletedAt: { type: Date, default: null },
        dataDeletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        dataDeletedByName: { type: String, default: '', trim: true, maxlength: 160 },
        originalRecordCount: { type: Number, default: 0, min: 0 },
        deletionReason: { type: String, default: '', trim: true, maxlength: 300 },
        archivedAt: { type: Date, default: null },
        archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        /** S3 archive metadata only (Phase 1). Raw rows stay in Mongo until a later retention phase. */
        s3Archive: {
            status: {
                type: String,
                enum: ['NOT_ARCHIVED', 'ARCHIVING', 'VERIFIED', 'FAILED'],
                default: 'NOT_ARCHIVED',
            },
            startedAt: { type: Date, default: null },
            completedAt: { type: Date, default: null },
            archivedAt: { type: Date, default: null },
            objectKey: { type: String, default: '', maxlength: 1024 },
            checksum: { type: String, default: '', maxlength: 80 },
            size: { type: Number, default: 0, min: 0 },
            recordCount: { type: Number, default: 0, min: 0 },
            error: { type: String, default: '', maxlength: 500 },
            storageProvider: { type: String, default: '', maxlength: 20 },
            bucket: { type: String, default: '', maxlength: 200 },
        },
        /** Embedded Facebook Group Member Collector checkpoint. Not a new collection. */
        facebookMemberCollector: { type: mongoose.Schema.Types.Mixed, default: undefined },
    },
    {
        timestamps: true,
        collection: 'search_campaigns',
    },
);

searchCampaignSchema.index({ companyId: 1, status: 1, updatedAt: -1 });
searchCampaignSchema.index({ companyId: 1, createdAt: -1 });
searchCampaignSchema.index({ companyId: 1, archivedAt: -1 });
searchCampaignSchema.index({ companyId: 1, nameNormalized: 1 });

const SearchCampaign = mongoose.models.SearchCampaign
    || mongoose.model('SearchCampaign', searchCampaignSchema);

export { SearchCampaign };
export default SearchCampaign;