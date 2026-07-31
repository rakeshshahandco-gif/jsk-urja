import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listRelevance,
    getRelevance,
    evaluateRelevance,
    excludeRelevance,
    restoreRelevance,
    getRelevanceHistory,
} from '../services/dataExtractor/leadRelevance/relevanceStore.service.js';
import { scoreLeadRelevance } from '../services/dataExtractor/leadRelevance/relevanceEngine.service.js';

function rejectTenantOverrides(req) {
    if (req.body?.companyId != null || req.body?.tenantId != null || req.query?.companyId != null || req.query?.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

export const list = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listRelevance(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Lead relevance records'));
});

export const getOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getRelevance(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Lead relevance'));
});

export const evaluate = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await evaluateRelevance(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'Relevance evaluated'));
});

export const evaluateSample = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const body = req.body || {};
    const result = scoreLeadRelevance({
        record: body.record || {
            companyName: body.companyName,
            businessDescription: body.businessDescription,
            keywords: body.keywords,
            productCategories: body.productCategories,
            city: body.city,
            state: body.state,
            country: body.country,
            website: body.website,
        },
        classification: body.classification || null,
        searchContext: {
            searchKeyword: body.searchKeyword || body.keyword || '',
            selectedIndustry: body.selectedIndustry || '',
            selectedProduct: body.selectedProduct || '',
            selectedLocation: body.selectedLocation || body.location || '',
        },
        settingsDoc: {
            aiLeadIntelligence: {
                enabled: true,
                targetMarket: body.targetMarket || {},
            },
        },
        opportunityMaps: body.opportunityMaps || [],
    });
    const blob = JSON.stringify(result);
    if (/sk-[a-zA-Z0-9]|OPENAI_API_KEY|apiKey/i.test(blob)) {
        throw new ApiError(500, 'Refusing to return payload that may contain secrets');
    }
    res.send(new ApiResponse(200, result, 'Sample relevance scored'));
});

export const excludeOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await excludeRelevance(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Moved to excluded / low relevance'));
});

export const restoreOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await restoreRelevance(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Restored from excluded / low relevance'));
});

export const history = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getRelevanceHistory(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Relevance history'));
});
