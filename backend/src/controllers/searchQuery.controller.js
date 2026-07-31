import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    approveSearchQuery,
    archiveSearchQuery,
    bulkApproveSearchQueries,
    bulkRejectSearchQueries,
    createManualSearchQuery,
    generateSearchQueries,
    getSearchQuery,
    listSearchQueries,
    openSearchQuery,
    regenerateSearchQueries,
    rejectSearchQuery,
    updateSearchQuery,
} from '../services/dataExtractor/searchCampaign/searchQuery/searchQuery.service.js';

function requireCompanyContext(req) {
    if (!req.companyId) {
        throw new ApiError(400, 'Company context required');
    }
    return req.companyId;
}

export const generateQueries = asyncHandler(async (req, res) => {
    const data = await generateSearchQueries({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        body: req.body,
    });
    res.status(201).send(new ApiResponse(201, data, 'Search queries generated'));
});

export const regenerateQueries = asyncHandler(async (req, res) => {
    const data = await regenerateSearchQueries({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        body: req.body,
    });
    res.status(201).send(new ApiResponse(201, data, 'Search queries regenerated'));
});

export const createQuery = asyncHandler(async (req, res) => {
    const query = await createManualSearchQuery({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        body: req.body,
    });
    res.status(201).send(new ApiResponse(201, { query }, 'Search query created'));
});

export const listQueries = asyncHandler(async (req, res) => {
    const data = await listSearchQueries({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        query: req.query,
    });
    res.send(new ApiResponse(200, data, 'Search queries'));
});

export const getQuery = asyncHandler(async (req, res) => {
    const query = await getSearchQuery({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        queryId: req.params.queryId,
    });
    res.send(new ApiResponse(200, { query }, 'Search query'));
});

export const updateQuery = asyncHandler(async (req, res) => {
    const data = await updateSearchQuery({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        queryId: req.params.queryId,
        body: req.body,
    });
    res.send(new ApiResponse(200, data, data.derived ? 'Derived draft query created' : 'Search query updated'));
});

export const approveQuery = asyncHandler(async (req, res) => {
    const query = await approveSearchQuery({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        queryId: req.params.queryId,
    });
    res.send(new ApiResponse(200, { query }, 'Search query approved'));
});

export const rejectQuery = asyncHandler(async (req, res) => {
    const query = await rejectSearchQuery({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        queryId: req.params.queryId,
        body: req.body,
    });
    res.send(new ApiResponse(200, { query }, 'Search query rejected'));
});

export const openQuery = asyncHandler(async (req, res) => {
    const data = await openSearchQuery({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        queryId: req.params.queryId,
    });
    res.send(new ApiResponse(200, data, 'Search query open recorded'));
});

export const archiveQuery = asyncHandler(async (req, res) => {
    const query = await archiveSearchQuery({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        queryId: req.params.queryId,
    });
    res.send(new ApiResponse(200, { query }, 'Search query archived'));
});

export const bulkApproveQueries = asyncHandler(async (req, res) => {
    const data = await bulkApproveSearchQueries({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        body: req.body,
    });
    res.send(new ApiResponse(200, data, 'Bulk approve completed'));
});

export const bulkRejectQueries = asyncHandler(async (req, res) => {
    const data = await bulkRejectSearchQueries({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        body: req.body,
    });
    res.send(new ApiResponse(200, data, 'Bulk reject completed'));
});
