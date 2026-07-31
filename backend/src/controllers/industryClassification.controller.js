import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listClassifications,
    getClassification,
    getClassificationEvidence,
    getClassificationHistory,
    getClassificationAudit,
    classifyOneRecord,
    overrideClassification,
    lockClassification,
    markIrrelevantClassification,
    reanalyzeClassification,
} from '../services/dataExtractor/industryClassification/classificationStore.service.js';
import {
    createClassificationBatch,
    getClassificationBatch,
    listClassificationBatches,
    controlClassificationBatch,
    processClassificationBatchChunk,
} from '../services/dataExtractor/industryClassification/batch.service.js';

function rejectTenantOverrides(req) {
    if (req.body?.companyId != null || req.body?.tenantId != null || req.query?.companyId != null || req.query?.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

function stripSensitiveFields(doc) {
    if (!doc || typeof doc !== 'object') return doc;
    const out = { ...doc };
    delete out.evidenceSnippets;
    delete out.evidenceSourceUrls;
    delete out.history;
    delete out.rawPayload;
    delete out.auditLog;
    return out;
}

export const list = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listClassifications(req.companyId, req.query);
    res.send(new ApiResponse(200, {
        ...data,
        results: (data.results || []).map(stripSensitiveFields),
    }, 'Industry classifications'));
});

export const getOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getClassification(req.companyId, req.params.id);
    res.send(new ApiResponse(200, stripSensitiveFields(data), 'Industry classification'));
});

export const getEvidence = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getClassificationEvidence(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Classification evidence'));
});

export const getHistory = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getClassificationHistory(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Classification history'));
});

export const getAudit = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getClassificationAudit(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Classification audit'));
});

export const classifyOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await classifyOneRecord(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'Record classified'));
});

/** Accept or change industry only — lock/irrelevant use dedicated routes. */
export const overrideOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const action = String(req.body?.action || 'override');
    if (!['accept', 'override'].includes(action)) {
        throw new ApiError(400, 'Use dedicated lock or mark-irrelevant endpoints for that action');
    }
    const data = await overrideClassification(req.companyId, req.user.id, req.params.id, {
        ...(req.body || {}),
        action,
    });
    res.send(new ApiResponse(200, data, 'Classification updated'));
});

export const lockOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const action = String(req.body?.action || 'lock');
    if (!['lock', 'unlock'].includes(action)) {
        throw new ApiError(400, 'action must be lock or unlock');
    }
    const data = await lockClassification(req.companyId, req.user.id, req.params.id, {
        action,
        reason: req.body?.reason || '',
    });
    res.send(new ApiResponse(200, data, action === 'unlock' ? 'Classification unlocked' : 'Classification locked'));
});

export const markIrrelevantOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await markIrrelevantClassification(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Marked irrelevant'));
});

export const reanalyzeOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await reanalyzeClassification(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Classification re-analyzed'));
});

export const createBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await createClassificationBatch(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'Classification batch created'));
});

export const listBatches = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listClassificationBatches(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Classification batches'));
});

export const getBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getClassificationBatch(req.companyId, req.params.id);
    const { auditLog, ...safe } = data || {};
    res.send(new ApiResponse(200, safe, 'Classification batch'));
});

export const getBatchAudit = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getClassificationBatch(req.companyId, req.params.id);
    res.send(new ApiResponse(200, { _id: data._id, auditLog: data.auditLog || [] }, 'Batch audit'));
});

export const controlBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await controlClassificationBatch(
        req.companyId,
        req.user.id,
        req.params.id,
        req.body?.action,
        { reason: req.body?.reason || req.body?.pauseReason || '' },
    );
    res.send(new ApiResponse(200, data, 'Batch control applied'));
});

export const processBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await processClassificationBatchChunk(req.companyId, req.user.id, req.params.id, {
        maxItems: Number(req.body?.maxItems) || 10,
    });
    res.send(new ApiResponse(200, data, 'Batch chunk processed'));
});
