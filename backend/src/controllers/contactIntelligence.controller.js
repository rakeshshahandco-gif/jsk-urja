import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    listContactIntelligence,
    getContactIntelligence,
    getContactHistory,
    analyzeOne,
    overrideContactAnalysis,
    lockContactAnalysis,
    exportApprovedContacts,
} from '../services/dataExtractor/contactIntelligence/contactStore.service.js';
import {
    listContactRoles,
    saveContactRoles,
    seedDefaultRoles,
} from '../services/dataExtractor/contactIntelligence/roleMaster.service.js';
import {
    createContactBatch,
    getContactBatch,
    listContactBatches,
    controlContactBatch,
    processContactBatchChunk,
} from '../services/dataExtractor/contactIntelligence/batch.service.js';
import { analyzeCompanyContacts } from '../services/dataExtractor/contactIntelligence/analyze.service.js';
import { DEFAULT_ROLE_SEED } from '../services/dataExtractor/contactIntelligence/constants.js';

function rejectTenantOverrides(req) {
    if (req.body?.companyId != null || req.body?.tenantId != null || req.query?.companyId != null || req.query?.tenantId != null) {
        throw new ApiError(400, 'companyId/tenantId overrides are rejected');
    }
}

export const listRoles = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listContactRoles(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Contact roles'));
});

export const saveRoles = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await saveContactRoles(req.companyId, req.body?.roles || req.body || [], req.user.id);
    res.send(new ApiResponse(200, { results: data }, 'Contact roles saved'));
});

export const seedRoles = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await seedDefaultRoles(req.companyId, req.user.id);
    res.send(new ApiResponse(200, { results: data }, 'Contact roles seeded'));
});

export const list = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listContactIntelligence(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Contact intelligence'));
});

export const getOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getContactIntelligence(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Contact intelligence detail'));
});

export const history = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getContactHistory(req.companyId, req.params.id);
    res.send(new ApiResponse(200, data, 'Contact history'));
});

export const analyze = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await analyzeOne(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'Contact analysis complete'));
});

export const analyzeSample = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const body = req.body || {};
    const result = analyzeCompanyContacts({
        record: body.record || body,
        roles: body.roles?.length ? body.roles : DEFAULT_ROLE_SEED,
        classification: body.classification || null,
        relevance: body.relevance || null,
        recommendation: body.recommendation || null,
        options: {
            opportunityType: body.opportunityType || '',
            inferredEmails: body.inferredEmails || [],
            imported: body.imported === true,
        },
    });
    const blob = JSON.stringify(result);
    if (/password|cookie|sk-[a-z0-9]|openai_api_key|sessiontoken/i.test(blob)) {
        throw new ApiError(500, 'Refusing to return secret/session values');
    }
    res.send(new ApiResponse(200, result, 'Sample contact analysis'));
});

export const overrideOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await overrideContactAnalysis(req.companyId, req.user.id, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Contact analysis updated'));
});

export const lockOne = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const action = String(req.body?.action || 'lock');
    if (!['lock', 'unlock'].includes(action)) throw new ApiError(400, 'action must be lock or unlock');
    const data = await lockContactAnalysis(req.companyId, req.user.id, req.params.id, { action, reason: req.body?.reason || '' });
    res.send(new ApiResponse(200, data, action === 'unlock' ? 'Unlocked' : 'Locked'));
});

export const exportApproved = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await exportApprovedContacts(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Approved contacts export'));
});

export const createBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await createContactBatch(req.companyId, req.user.id, req.body || {});
    res.status(201).send(new ApiResponse(201, data, 'Contact batch created'));
});

export const listBatches = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await listContactBatches(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Contact batches'));
});

export const getBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getContactBatch(req.companyId, req.params.id);
    const { auditLog, ...safe } = data || {};
    res.send(new ApiResponse(200, safe, 'Contact batch'));
});

export const getBatchAudit = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await getContactBatch(req.companyId, req.params.id);
    res.send(new ApiResponse(200, { _id: data._id, auditLog: data.auditLog || [] }, 'Batch audit'));
});

export const controlBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await controlContactBatch(req.companyId, req.user.id, req.params.id, req.body?.action, {
        reason: req.body?.reason || req.body?.pauseReason || '',
    });
    res.send(new ApiResponse(200, data, 'Batch control applied'));
});

export const processBatch = asyncHandler(async (req, res) => {
    rejectTenantOverrides(req);
    const data = await processContactBatchChunk(req.companyId, req.user.id, req.params.id, {
        maxItems: Number(req.body?.maxItems) || 10,
    });
    res.send(new ApiResponse(200, data, 'Batch chunk processed'));
});
