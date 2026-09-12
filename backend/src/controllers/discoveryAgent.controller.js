import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    createAgentToken,
    listAgentTokens,
    revokeAgentToken,
} from '../services/dataExtractor/discovery/agent/agentToken.service.js';
import {
    createAgentJob,
    listAgentJobs,
    getAgentJob,
    setAgentControl,
    agentConnect,
    agentHeartbeat,
    claimAgentJob,
} from '../services/dataExtractor/discovery/agent/agentJob.service.js';
import { ingestAgentRecords } from '../services/dataExtractor/discovery/agent/agentIngest.service.js';

const FORBIDDEN_SCOPE_KEYS = ['companyId', 'tenantId', 'company_id', 'tenant_id'];

function isExtractorAdmin(user) {
    const role = String(user?.roleName || user?.role?.name || '').trim().toLowerCase();
    return ['superadmin', 'admin', 'system admin', 'systemadmin'].includes(role);
}

function rejectScopedBody(body = {}) {
    for (const key of FORBIDDEN_SCOPE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(body || {}, key)) {
            throw new ApiError(400, 'Do not send ' + key + ' in the request body; company scope comes from auth context');
        }
    }
}

// ---- CRM user routes (JWT) ----
export const createToken = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const data = await createAgentToken({
        companyId: req.companyId,
        userId: req.user.id,
        userName: req.user?.name || req.user?.fullName || req.user?.username || '',
        name: req.body?.name,
        deviceName: req.body?.deviceName,
        deviceId: req.body?.deviceId,
        hostname: req.body?.hostname,
        expiresInDays: req.body?.expiresInDays,
    });
    res.status(201).send(new ApiResponse(201, data, 'Discovery agent token created'));
});

export const listTokens = asyncHandler(async (req, res) => {
    const data = await listAgentTokens(req.companyId, {
        userId: req.user?.id,
        admin: isExtractorAdmin(req.user),
    });
    res.send(new ApiResponse(200, { tokens: data }, 'Discovery agent tokens'));
});

export const revokeToken = asyncHandler(async (req, res) => {
    const data = await revokeAgentToken(req.companyId, req.params.id, {
        userId: req.user?.id,
        admin: isExtractorAdmin(req.user),
    });
    res.send(new ApiResponse(200, data, 'Token revoked'));
});

export const createJob = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const financialYear = req.body.financialYear || req.query.financialYear;
    const data = await createAgentJob({
        companyId: req.companyId,
        userId: req.user.id,
        financialYear,
        sourceMode: req.body.sourceMode,
        keyword: req.body.keyword,
        city: req.body.city,
        state: req.body.state,
        country: req.body.country,
        maxPages: req.body.maxPages,
        maxCompanies: req.body.maxCompanies,
        delayMsMin: req.body.delayMsMin,
        delayMsMax: req.body.delayMsMax,
        maxConcurrentTabs: req.body.maxConcurrentTabs,
        websiteEnrichment: req.body.websiteEnrichment,
    });
    res.status(201).send(new ApiResponse(201, data, 'Discovery agent job created'));
});

export const listJobs = asyncHandler(async (req, res) => {
    const data = await listAgentJobs(req.companyId, req.query);
    res.send(new ApiResponse(200, data, 'Discovery agent jobs'));
});

export const getJob = asyncHandler(async (req, res) => {
    const job = await getAgentJob(req.companyId, req.params.id);
    res.send(new ApiResponse(200, { job }, 'Discovery agent job'));
});

export const controlJob = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const job = await setAgentControl(req.companyId, req.params.id, req.body.command, {
        message: req.body.message,
    });
    res.send(new ApiResponse(200, { job }, 'Control command issued'));
});

// ---- Local agent routes (agent token) ----
export const connect = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const data = await agentConnect(req.companyId, req.agentToken._id, {
        agentInstanceId: req.body?.agentInstanceId,
        deviceId: req.body?.deviceId,
        deviceName: req.body?.deviceName,
        hostname: req.body?.hostname,
        version: req.body?.version,
        applicationKey: req.body?.applicationKey,
    });
    res.send(new ApiResponse(200, data, 'Agent connected'));
});

export const claimJob = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const job = await claimAgentJob(
        req.companyId,
        req.params.id,
        req.agentToken._id,
        req.body?.agentInstanceId,
    );
    res.send(new ApiResponse(200, { job }, 'Agent job claimed'));
});

export const heartbeat = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const data = await agentHeartbeat(req.companyId, req.params.id, req.body || {});
    res.send(new ApiResponse(200, data, 'Heartbeat ok'));
});

export const ingest = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const data = await ingestAgentRecords(req.companyId, req.params.id, {
        records: req.body?.records,
        currentPageUrl: req.body?.currentPageUrl,
        extractedCount: req.body?.extractedCount,
    });
    res.send(new ApiResponse(200, data, 'Records ingested as drafts'));
});

export const agentGetJob = asyncHandler(async (req, res) => {
    const job = await getAgentJob(req.companyId, req.params.id);
    res.send(new ApiResponse(200, { job }, 'Discovery agent job'));
});
