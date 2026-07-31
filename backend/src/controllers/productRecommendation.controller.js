import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listRecommendations,
    getRecommendation,
    getRecommendationHistory,
    recommendOne,
    overrideRecommendation,
    lockRecommendation,
} from '../services/dataExtractor/productRecommendation/recommendationStore.service.js';
import {
    createRecommendationBatch,
    getRecommendationBatch,
    listRecommendationBatches,
    controlRecommendationBatch,
    processRecommendationBatchChunk,
} from '../services/dataExtractor/productRecommendation/batch.service.js';
import {
    listProductMasters,
    saveProductMasters,
} from '../services/dataExtractor/productRecommendation/productMaster.service.js';
import { runProductRecommendation } from '../services/dataExtractor/productRecommendation/recommend.service.js';

function rejectTenantOverrides(req) {
    if (req.body?.companyId != null || req.body?.tenantId != null || req.query?.companyId != null || req.query?.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

export const listProducts = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listProductMasters(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Product masters'));
});

export const saveProducts = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await saveProductMasters(req.companyId, req.body?.products || req.body || [], req.user.id);
    res.send(new ApiResponse(200, { results: data }, 'Product masters saved'));
});

export const list = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listRecommendations(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Product recommendations'));
});

export const getOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getRecommendation(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Product recommendation'));
});

export const history = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getRecommendationHistory(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Recommendation history'));
});

export const recommend = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await recommendOne(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'Recommendation generated'));
});

export const recommendSample = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const body = req.body || {};
    const result = await runProductRecommendation({
        record: body.record || body,
        classification: body.classification || null,
        relevance: body.relevance || null,
        products: body.products || [],
        opportunityMaps: body.opportunityMaps || [],
        settingsDoc: {
            aiLeadIntelligence: {
                productRecommendation: body.productRecommendation || { mode: body.mode || 'rule_based' },
                targetMarket: body.targetMarket || {},
            },
        },
        searchContext: {
            searchKeyword: body.searchKeyword || '',
            selectedIndustry: body.selectedIndustry || '',
            selectedProduct: body.selectedProduct || '',
            selectedLocation: body.selectedLocation || '',
        },
        customerType: body.customerType || '',
        forceMode: body.mode || 'rule_based',
    });
    const blob = JSON.stringify(result);
    if (/sk-[a-zA-Z0-9]|OPENAI_API_KEY|apiKey/i.test(blob)) {
        throw new ApiError(500, 'Refusing to return payload that may contain secrets');
    }
    res.send(new ApiResponse(200, result, 'Sample recommendation'));
});

export const overrideOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const action = String(req.body?.action || 'override');
    if (!['accept', 'reject', 'override'].includes(action)) {
        throw new ApiError(400, 'Invalid override action');
    }
    const data = await overrideRecommendation(req.companyId, req.user.id, req.params.id, { ...(req.body || {}), action });
    res.send(new ApiResponse(200, data, 'Recommendation updated'));
});

export const lockOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const action = String(req.body?.action || 'lock');
    if (!['lock', 'unlock'].includes(action)) throw new ApiError(400, 'action must be lock or unlock');
    const data = await lockRecommendation(req.companyId, req.user.id, req.params.id, { action, reason: req.body?.reason || '' });
    res.send(new ApiResponse(200, data, action === 'unlock' ? 'Unlocked' : 'Locked'));
});

export const createBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await createRecommendationBatch(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'Recommendation batch created'));
});

export const listBatches = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listRecommendationBatches(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Recommendation batches'));
});

export const getBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getRecommendationBatch(req.companyId, req.params.id);
    const { auditLog, ...safe } = data || {};
    res.send(new ApiResponse(200, safe, 'Recommendation batch'));
});

export const getBatchAudit = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getRecommendationBatch(req.companyId, req.params.id);
    res.send(new ApiResponse(200, { _id: data._id, auditLog: data.auditLog || [] }, 'Batch audit'));
});

export const controlBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await controlRecommendationBatch(req.companyId, req.user.id, req.params.id, req.body?.action, {
        reason: req.body?.reason || req.body?.pauseReason || '',
    });
    res.send(new ApiResponse(200, data, 'Batch control applied'));
});

export const processBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await processRecommendationBatchChunk(req.companyId, req.user.id, req.params.id, {
        maxItems: Number(req.body?.maxItems) || 10,
    });
    res.send(new ApiResponse(200, data, 'Batch chunk processed'));
});
