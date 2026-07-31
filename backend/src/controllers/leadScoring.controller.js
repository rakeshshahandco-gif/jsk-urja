import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listScores,
    getScore,
    getScoreHistory,
    scoreOne,
    overrideScore,
    lockScore,
    exportApprovedScores,
} from '../services/dataExtractor/leadScoring/scoreStore.service.js';
import {
    createScoreBatch,
    getScoreBatch,
    listScoreBatches,
    controlScoreBatch,
    processScoreBatchChunk,
} from '../services/dataExtractor/leadScoring/batch.service.js';
import { getLeadScoringSettings, saveLeadScoringSettings } from '../services/dataExtractor/leadScoring/settings.service.js';
import { runLeadScoring } from '../services/dataExtractor/leadScoring/score.service.js';

function rejectTenantOverrides(req) {
    if (req.body?.companyId != null || req.body?.tenantId != null || req.query?.companyId != null || req.query?.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

export const getSettings = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getLeadScoringSettings(req.companyId);
    res.send(new ApiResponse(200, data, 'Lead scoring settings'));
});

export const saveSettings = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await saveLeadScoringSettings(req.companyId, req.user.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Lead scoring settings saved'));
});

export const list = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listScores(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Lead scores'));
});

export const getOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getScore(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Lead score'));
});

export const history = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getScoreHistory(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Lead score history'));
});

export const score = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await scoreOne(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'Lead scored'));
});

export const scoreSample = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const body = req.body || {};
    const settings = body.settings || await getLeadScoringSettings(req.companyId);
    const data = await runLeadScoring({
        record: body.record || body,
        classification: body.classification || null,
        relevance: body.relevance || null,
        recommendation: body.recommendation || null,
        contact: body.contact || null,
        profile: body.profile || null,
        settings,
        searchContext: body.searchContext || null,
        mode: body.mode || null,
    });
    const blob = JSON.stringify(data);
    if (/password|cookie|sk-[a-z0-9]|openai_api_key|sessiontoken/i.test(blob)) {
        throw new ApiError(500, 'Refusing to return secret/session values');
    }
    res.send(new ApiResponse(200, data, 'Sample lead score'));
});

export const overrideOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await overrideScore(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Lead score updated'));
});

export const approveOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await overrideScore(req.companyId, req.user.id, req.params.id, { ...(req.body || {}), action: 'approve' });
    res.send(new ApiResponse(200, data, 'Lead score approved'));
});

export const rejectOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await overrideScore(req.companyId, req.user.id, req.params.id, { ...(req.body || {}), action: 'reject' });
    res.send(new ApiResponse(200, data, 'Lead score rejected'));
});

export const lockOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const action = String(req.body?.action || 'lock');
    if (!['lock', 'unlock'].includes(action)) throw new ApiError(400, 'action must be lock or unlock');
    const data = await lockScore(req.companyId, req.user.id, req.params.id, { action, reason: req.body?.reason || '' });
    res.send(new ApiResponse(200, data, action === 'unlock' ? 'Unlocked' : 'Locked'));
});

export const exportApproved = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await exportApprovedScores(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Approved scores export'));
});

export const createBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await createScoreBatch(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'Score batch created'));
});

export const listBatches = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listScoreBatches(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Score batches'));
});

export const getBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getScoreBatch(req.companyId, req.params.id);
    const { auditLog, ...safe } = data || {};
    res.send(new ApiResponse(200, safe, 'Score batch'));
});

export const getBatchAudit = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getScoreBatch(req.companyId, req.params.id);
    res.send(new ApiResponse(200, { _id: data._id, auditLog: data.auditLog || [] }, 'Batch audit'));
});

export const controlBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await controlScoreBatch(req.companyId, req.user.id, req.params.id, req.body?.action, {
        reason: req.body?.reason || req.body?.pauseReason || '',
    });
    res.send(new ApiResponse(200, data, 'Batch control applied'));
});

export const processBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await processScoreBatchChunk(req.companyId, req.user.id, req.params.id, {
        maxItems: Number(req.body?.maxItems) || 10,
    });
    res.send(new ApiResponse(200, data, 'Batch chunk processed'));
});
