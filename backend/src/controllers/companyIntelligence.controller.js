import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listProfiles,
    getProfile,
    getProfileHistory,
    generateOne,
    editProfile,
    lockProfile,
    exportApprovedProfiles,
} from '../services/dataExtractor/companyIntelligence/profileStore.service.js';
import {
    createProfileBatch,
    getProfileBatch,
    listProfileBatches,
    controlProfileBatch,
    processProfileBatchChunk,
} from '../services/dataExtractor/companyIntelligence/batch.service.js';
import { generateCompanyProfile } from '../services/dataExtractor/companyIntelligence/generate.service.js';

function rejectTenantOverrides(req) {
    if (req.body?.companyId != null || req.body?.tenantId != null || req.query?.companyId != null || req.query?.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

export const list = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listProfiles(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Company intelligence profiles'));
});

export const getOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getProfile(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Company intelligence profile'));
});

export const history = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getProfileHistory(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Profile history'));
});

export const generate = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await generateOne(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'Profile generated'));
});

export const generateSample = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const body = req.body || {};
    const data = await generateCompanyProfile({
        record: body.record || body,
        classification: body.classification || null,
        relevance: body.relevance || null,
        recommendation: body.recommendation || null,
        contact: body.contact || null,
        mode: body.mode || 'rule_based',
    });
    const blob = JSON.stringify(data);
    if (/password|cookie|sk-[a-z0-9]|openai_api_key|sessiontoken/i.test(blob)) {
        throw new ApiError(500, 'Refusing to return secret/session values');
    }
    res.send(new ApiResponse(200, data, 'Sample profile'));
});

export const editOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await editProfile(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Profile updated'));
});

export const approveOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await editProfile(req.companyId, req.user.id, req.params.id, { ...(req.body || {}), action: 'approve' });
    res.send(new ApiResponse(200, data, 'Profile approved'));
});

export const lockOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const action = String(req.body?.action || 'lock');
    if (!['lock', 'unlock'].includes(action)) throw new ApiError(400, 'action must be lock or unlock');
    const data = await lockProfile(req.companyId, req.user.id, req.params.id, { action, reason: req.body?.reason || '' });
    res.send(new ApiResponse(200, data, action === 'unlock' ? 'Unlocked' : 'Locked'));
});

export const exportApproved = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await exportApprovedProfiles(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Approved profiles export'));
});

export const createBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await createProfileBatch(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'Profile batch created'));
});

export const listBatches = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listProfileBatches(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Profile batches'));
});

export const getBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getProfileBatch(req.companyId, req.params.id);
    const { auditLog, ...safe } = data || {};
    res.send(new ApiResponse(200, safe, 'Profile batch'));
});

export const getBatchAudit = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getProfileBatch(req.companyId, req.params.id);
    res.send(new ApiResponse(200, { _id: data._id, auditLog: data.auditLog || [] }, 'Batch audit'));
});

export const controlBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await controlProfileBatch(req.companyId, req.user.id, req.params.id, req.body?.action, {
        reason: req.body?.reason || req.body?.pauseReason || '',
    });
    res.send(new ApiResponse(200, data, 'Batch control applied'));
});

export const processBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await processProfileBatchChunk(req.companyId, req.user.id, req.params.id, {
        maxItems: Number(req.body?.maxItems) || 10,
    });
    res.send(new ApiResponse(200, data, 'Batch chunk processed'));
});
