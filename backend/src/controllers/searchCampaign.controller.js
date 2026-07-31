import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    archiveSearchCampaign,
    changeSearchCampaignStatus,
    createSearchCampaign,
    getSearchCampaign,
    listSearchCampaigns,
    updateSearchCampaign,
} from '../services/dataExtractor/searchCampaign/searchCampaign.service.js';

function requireCompanyContext(req) {
    if (!req.companyId) {
        throw new ApiError(400, 'Company context required');
    }
    return req.companyId;
}

export const createCampaign = asyncHandler(async (req, res) => {
    const campaign = await createSearchCampaign({
        companyId: requireCompanyContext(req),
        user: req.user,
        body: req.body,
    });
    res.status(201).send(new ApiResponse(201, { campaign }, 'Search campaign created'));
});

export const listCampaigns = asyncHandler(async (req, res) => {
    const data = await listSearchCampaigns({
        companyId: requireCompanyContext(req),
        user: req.user,
        query: req.query,
    });
    res.send(new ApiResponse(200, data, 'Search campaigns'));
});

export const getCampaign = asyncHandler(async (req, res) => {
    const campaign = await getSearchCampaign({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
    });
    res.send(new ApiResponse(200, { campaign }, 'Search campaign'));
});

export const updateCampaign = asyncHandler(async (req, res) => {
    const campaign = await updateSearchCampaign({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        body: req.body,
    });
    res.send(new ApiResponse(200, { campaign }, 'Search campaign updated'));
});

export const changeCampaignStatus = asyncHandler(async (req, res) => {
    const campaign = await changeSearchCampaignStatus({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        body: req.body,
    });
    res.send(new ApiResponse(200, { campaign }, 'Search campaign status updated'));
});

export const archiveCampaign = asyncHandler(async (req, res) => {
    const campaign = await archiveSearchCampaign({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
    });
    res.send(new ApiResponse(200, { campaign }, 'Search campaign archived'));
});