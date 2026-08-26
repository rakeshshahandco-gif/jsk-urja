import mongoose from 'mongoose';
import {
    SEARCH_QUERY_ACTIVE_STATUSES,
    SEARCH_QUERY_GENERATION_METHODS,
    SEARCH_QUERY_SOURCE_HINTS,
    SEARCH_QUERY_STATUSES,
    SEARCH_QUERY_TYPES,
    SEARCH_QUERY_UNIQUE_INDEX_NAME,
} from '../services/dataExtractor/searchCampaign/searchQuery/constants.js';
import { SLS_QUERY_CAPTURE_STATUSES } from '../services/dataExtractor/searchCampaign/simpleLeadSearch/slsQueryProgress.constants.js';

const searchQuerySchema = new mongoose.Schema(
    {
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SearchCampaign', required: true, index: true },
        queryText: { type: String, required: true, trim: true, maxlength: 500 },
        queryNormalized: { type: String, required: true, trim: true, index: true },
        sourceHint: { type: String, enum: SEARCH_QUERY_SOURCE_HINTS, required: true },
        queryType: { type: String, enum: SEARCH_QUERY_TYPES, default: 'general' },
        status: { type: String, enum: SEARCH_QUERY_STATUSES, default: 'generated', index: true },
        // Simple Lead Search owner workflow (additive; does not replace status)
        slsCaptureStatus: {
            type: String,
            enum: SLS_QUERY_CAPTURE_STATUSES,
            default: 'pending',
            index: true,
        },
        slsCaptureEventCount: { type: Number, default: 0, min: 0 },
        slsVisibleResultCount: { type: Number, default: 0, min: 0 },
        slsNewUniqueCount: { type: Number, default: 0, min: 0 },
        slsUpdatedExistingCount: { type: Number, default: 0, min: 0 },
        slsLastGooglePage: { type: Number, default: 0, min: 0 },
        slsLastCapturedAt: { type: Date, default: null },
        generationMethod: { type: String, enum: SEARCH_QUERY_GENERATION_METHODS, default: 'automatic' },
        generationGroupId: { type: String, trim: true, default: '', index: true },
        generationSequence: { type: Number, default: 0 },
        parentQueryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SearchQuery', default: null },
        regenerationReason: { type: String, trim: true, default: '' },
        generatedFrom: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        selectedCriteria: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        searchUrl: { type: String, trim: true, default: '' },
        priorityScore: { type: Number, default: 50, min: 0, max: 100 },
        openedCount: { type: Number, default: 0, min: 0 },
        lastOpenedAt: { type: Date, default: null },
        lastOpenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        captureCount: { type: Number, default: 0, min: 0 },
        resultCount: { type: Number, default: 0, min: 0 },
        lastCapturedAt: { type: Date, default: null },
        lastCapturedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        notes: { type: String, trim: true, default: '', maxlength: 2000 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        approvedAt: { type: Date, default: null },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        rejectedAt: { type: Date, default: null },
        rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        rejectionReason: { type: String, trim: true, default: '' },
        archivedAt: { type: Date, default: null },
        archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, collection: 'search_queries', autoCreate: false, autoIndex: false },
);

searchQuerySchema.index({ companyId: 1, campaignId: 1, status: 1, updatedAt: -1 });
searchQuerySchema.index({ companyId: 1, campaignId: 1, createdAt: -1 });
searchQuerySchema.index({ companyId: 1, campaignId: 1, sourceHint: 1 });
searchQuerySchema.index({ companyId: 1, campaignId: 1, generationGroupId: 1 });
// Active (non-archived) exact duplicate control.
// MongoDB partial indexes do not support $ne — use $in of active statuses.
searchQuerySchema.index(
    { companyId: 1, campaignId: 1, queryNormalized: 1 },
    {
        unique: true,
        name: SEARCH_QUERY_UNIQUE_INDEX_NAME,
        partialFilterExpression: { status: { $in: [...SEARCH_QUERY_ACTIVE_STATUSES] } },
    },
);

const SearchQuery = mongoose.models.SearchQuery || mongoose.model('SearchQuery', searchQuerySchema);
export { SearchQuery };
export default SearchQuery;
