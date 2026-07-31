import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listDrafts, getDraft, getDraftHistory, prepareDraft, reviewDraft,
    previewDraft, finalApproveDraft, applyApprovedActions,
    rejectDraft, cancelDraft, lockDraft, exportDrafts, recommendOnly,
} from '../services/dataExtractor/salesWorkflow/draft.service.js';
import { rollbackTransaction, getTransaction } from '../services/dataExtractor/salesWorkflow/rollback.service.js';
import {
    createSalesWorkflowBatch, getSalesWorkflowBatch, listSalesWorkflowBatches,
    controlSalesWorkflowBatch, processSalesWorkflowBatchChunk,
} from '../services/dataExtractor/salesWorkflow/batch.service.js';
import { getSalesWorkflowSettings, saveSalesWorkflowSettings } from '../services/dataExtractor/salesWorkflow/settings.service.js';
import { evaluateSalesWorkflowEligibility } from '../services/dataExtractor/salesWorkflow/eligibility.service.js';

function rejectTenantOverrides(req) {
    if (req.body?.companyId != null || req.body?.tenantId != null || req.query?.companyId != null || req.query?.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

export const list = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listDrafts(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Sales workflow drafts'));
});

export const getOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getDraft(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Sales workflow draft'));
});

export const history = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getDraftHistory(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Sales workflow history'));
});

export const prepare = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await prepareDraft(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'Sales workflow draft prepared'));
});

export const recommend = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await recommendOnly(req.companyId, req.body || {});
    res.send(new ApiResponse(200, data, 'Salesperson recommendations'));
});

export const eligibilitySample = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = evaluateSalesWorkflowEligibility(req.body || {});
    res.send(new ApiResponse(200, data, 'Eligibility sample'));
});

export const review = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await reviewDraft(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Sales workflow review saved'));
});

export const preview = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await previewDraft(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Sales workflow preview'));
});

export const finalApprove = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await finalApproveDraft(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Sales workflow finally approved'));
});

export const apply = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await applyApprovedActions(req.companyId, req.user.id, req.params.id, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Sales workflow actions applied'));
});

export const rejectOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await rejectDraft(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Draft rejected'));
});

export const cancelOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await cancelDraft(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Draft cancelled'));
});

export const lockOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const action = String(req.body?.action || 'lock');
    if (!['lock', 'unlock'].includes(action)) throw new ApiError(400, 'action must be lock or unlock');
    const data = await lockDraft(req.companyId, req.user.id, req.params.id, { action, reason: req.body?.reason || '' });
    res.send(new ApiResponse(200, data, action === 'unlock' ? 'Unlocked' : 'Locked'));
});

export const exportApproved = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await exportDrafts(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Sales workflow export'));
});

export const getTx = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getTransaction(req.companyId, req.params.txId);
    res.send(new ApiResponse(200, data, 'Sales workflow transaction'));
});

export const rollback = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await rollbackTransaction(req.companyId, req.user.id, req.params.txId, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Sales workflow rollback'));
});

export const listBatches = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listSalesWorkflowBatches(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Sales workflow batches'));
});

export const createBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await createSalesWorkflowBatch(req.companyId, req.user.id, req.body || {}, req.user);
    res.status(201).send(new ApiResponse(201, data, 'Sales workflow batch created'));
});

export const getBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getSalesWorkflowBatch(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Sales workflow batch'));
});

export const controlBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await controlSalesWorkflowBatch(req.companyId, req.user.id, req.params.id, req.body?.action, req.body || {});
    res.send(new ApiResponse(200, data, 'Batch control applied'));
});

export const processBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await processSalesWorkflowBatchChunk(req.companyId, req.user.id, req.params.id, req.body || {}, req.user);
    res.send(new ApiResponse(200, data, 'Batch chunk processed'));
});

export const getSettings = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getSalesWorkflowSettings(req.companyId);
    res.send(new ApiResponse(200, data, 'Sales workflow settings'));
});

export const saveSettings = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await saveSalesWorkflowSettings(req.companyId, req.user.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Sales workflow settings saved'));
});