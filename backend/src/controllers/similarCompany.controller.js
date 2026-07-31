import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listSimilarResults,
    getSimilarResult,
    getSimilarHistory,
    findSimilarForSeed,
    analyzeSamplePair,
    overrideSimilarResult,
    lockSimilarResult,
    exportApprovedCandidates,
} from '../services/dataExtractor/similarCompany/store.service.js';
import {
    listMarketIntel,
    getMarketIntel,
    runMarketIntelligence,
} from '../services/dataExtractor/similarCompany/marketStore.service.js';
import {
    createSimilarBatch,
    getSimilarBatch,
    listSimilarBatches,
    controlSimilarBatch,
    processSimilarBatchChunk,
} from '../services/dataExtractor/similarCompany/batch.service.js';
import { getSimilaritySettings, saveSimilaritySettings } from '../services/dataExtractor/similarCompany/settings.service.js';

function rejectTenantOverrides(req) {
    if (req.body?.companyId != null || req.body?.tenantId != null || req.query?.companyId != null || req.query?.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

export const getSettings = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getSimilaritySettings(req.companyId);
    res.send(new ApiResponse(200, data, 'Similar company settings'));
});

export const saveSettings = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await saveSimilaritySettings(req.companyId, req.user.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Similar company settings saved'));
});

export const list = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listSimilarResults(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Similar company results'));
});

export const getOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getSimilarResult(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Similar company result'));
});

export const history = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getSimilarHistory(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Similar company history'));
});

export const findSimilar = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await findSimilarForSeed(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'Similar companies found'));
});

export const findSample = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await analyzeSamplePair(req.companyId, req.body || {});
    const blob = JSON.stringify(data);
    if (/password|cookie|sk-[a-z0-9]|openai_api_key|sessiontoken/i.test(blob)) {
        throw new ApiError(500, 'Refusing to return secret/session values');
    }
    res.send(new ApiResponse(200, data, 'Sample similarity analysis'));
});

export const overrideOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await overrideSimilarResult(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Similar company result updated'));
});

export const approveOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await overrideSimilarResult(req.companyId, req.user.id, req.params.id, {
        ...(req.body || {}),
        action: 'approve_for_enrichment',
    });
    res.send(new ApiResponse(200, data, 'Approved for enrichment'));
});

export const rejectOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await overrideSimilarResult(req.companyId, req.user.id, req.params.id, {
        ...(req.body || {}),
        action: 'reject',
    });
    res.send(new ApiResponse(200, data, 'Candidate rejected'));
});

export const lockOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const action = String(req.body?.action || 'lock');
    if (!['lock', 'unlock'].includes(action)) throw new ApiError(400, 'action must be lock or unlock');
    const data = await lockSimilarResult(req.companyId, req.user.id, req.params.id, {
        action,
        reason: req.body?.reason || '',
    });
    res.send(new ApiResponse(200, data, action === 'unlock' ? 'Unlocked' : 'Locked'));
});

export const exportApproved = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await exportApprovedCandidates(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Approved candidates export'));
});

export const createBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await createSimilarBatch(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'Similar company batch created'));
});

export const listBatches = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listSimilarBatches(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Similar company batches'));
});

export const getBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getSimilarBatch(req.companyId, req.params.id);
    const { auditLog, ...safe } = data || {};
    res.send(new ApiResponse(200, safe, 'Similar company batch'));
});

export const getBatchAudit = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getSimilarBatch(req.companyId, req.params.id);
    res.send(new ApiResponse(200, { _id: data._id, auditLog: data.auditLog || [] }, 'Batch audit'));
});

export const controlBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await controlSimilarBatch(req.companyId, req.user.id, req.params.id, req.body?.action, {
        reason: req.body?.reason || req.body?.pauseReason || '',
    });
    res.send(new ApiResponse(200, data, 'Batch control applied'));
});

export const processBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await processSimilarBatchChunk(req.companyId, req.user.id, req.params.id, {
        maxItems: Number(req.body?.maxItems) || 5,
    });
    res.send(new ApiResponse(200, data, 'Batch chunk processed'));
});

export const listMarket = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listMarketIntel(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Market intelligence'));
});

export const getMarketOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getMarketIntel(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Market intelligence item'));
});

export const runMarket = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await runMarketIntelligence(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'Market intelligence generated'));
});
