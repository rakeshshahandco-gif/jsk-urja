import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    createAgentToken,
    listAgentTokens,
    revokeAgentToken,
} from '../services/dataExtractor/discovery/agent/agentToken.service.js';
import {
    createPairingSession,
    exchangePairingCode,
    LOCAL_PAIR_ORIGIN,
    PAIRING_TTL_MS,
} from '../services/dataExtractor/discovery/agent/agentPairing.service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
import {
    reportSourceStatus,
    requestSourceConnect,
    requestSourceLogout,
} from '../services/dataExtractor/discovery/agent/sourceConnect.service.js';
import {
    claimFacebookDirectAgentJob,
    ingestFacebookDirectAgentRecords,
    isFacebookDirectAgentJob,
    markFacebookDirectAgentExpired,
    pollFacebookDirectAgentJob,
    FACEBOOK_SESSION_EXPIRED_CODE,
} from '../services/dataExtractor/discovery/agent/facebookDirectAgent.service.js';

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

export const createPairing = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const data = await createPairingSession({
        companyId: req.companyId,
        userId: req.user.id,
        userName: req.user?.name || req.user?.fullName || req.user?.username || '',
    });
    res.status(201).send(new ApiResponse(201, data, 'Pairing code created'));
});

export const exchangePairing = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const data = await exchangePairingCode({
        pairingCode: req.body?.pairingCode,
        installId: req.body?.installId,
        hostname: req.body?.hostname,
        deviceName: req.body?.deviceName,
        agentVersion: req.body?.agentVersion,
    });
    res.send(new ApiResponse(200, data, 'Discovery Agent paired'));
});

export const pairingClientConfig = asyncHandler(async (_req, res) => {
    res.send(new ApiResponse(200, {
        localPairOrigin: LOCAL_PAIR_ORIGIN,
        expiresInSec: Math.round(PAIRING_TTL_MS / 1000),
        protocol: 'jskextract',
        legacyProtocol: 'jskdiscovery',
        product: 'JSK Extraction Agent',
    }, 'Extraction Agent pairing config'));
});

export const requestSourceConnectSession = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const data = await requestSourceConnect({
        companyId: req.companyId,
        userId: req.user.id,
        source: req.body?.source,
    });
    res.send(new ApiResponse(200, data, 'Open the local Extraction Agent to finish login'));
});

export const requestSourceLogoutSession = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const data = await requestSourceLogout({
        companyId: req.companyId,
        userId: req.user.id,
        source: req.body?.source,
    });
    res.send(new ApiResponse(200, data, 'Source logout requested'));
});

export const reportAgentSourceStatus = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const data = await reportSourceStatus({
        companyId: req.companyId,
        agentToken: req.agentToken,
        source: req.body?.source,
        patch: req.body || {},
    });
    res.send(new ApiResponse(200, data, 'Source status updated'));
});

export const downloadWindowsSetup = asyncHandler(async (_req, res) => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const distDir = path.resolve(here, '../../../tools/discovery-agent/windows/dist');
    const setupPath = [
        path.join(distDir, 'JSK-Extraction-Agent-Setup.exe'),
        path.join(distDir, 'JSK-Discovery-Agent-Setup.exe'),
    ].find((p) => fs.existsSync(p));
    const downloadName = setupPath && /Extraction/i.test(setupPath)
        ? 'JSK-Extraction-Agent-Setup.exe'
        : 'JSK-Discovery-Agent-Setup.exe';
    if (!setupPath) {
        throw new ApiError(404, 'JSK Extraction Agent Setup.exe is not built on this server yet.');
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    fs.createReadStream(setupPath).pipe(res);
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

export const pollJobs = asyncHandler(async (req, res) => {
    const job = await pollFacebookDirectAgentJob(req.companyId, req.agentToken);
    res.send(new ApiResponse(200, { job }, job ? 'Facebook Direct Agent job available' : 'No Facebook Direct Agent job'));
});

export const claimJob = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const existing = await getAgentJob(req.companyId, req.params.id);
    const job = isFacebookDirectAgentJob(existing)
        ? await claimFacebookDirectAgentJob(
            req.companyId,
            req.params.id,
            req.agentToken,
            req.body?.agentInstanceId,
        )
        : await claimAgentJob(
            req.companyId,
            req.params.id,
            req.agentToken._id,
            req.body?.agentInstanceId,
        );
    res.send(new ApiResponse(200, { job }, 'Agent job claimed'));
});

export const heartbeat = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const body = req.body || {};
    const existing = await getAgentJob(req.companyId, req.params.id);
    if (
        isFacebookDirectAgentJob(existing)
        && (body.status === FACEBOOK_SESSION_EXPIRED_CODE || body.code === FACEBOOK_SESSION_EXPIRED_CODE)
    ) {
        const data = await markFacebookDirectAgentExpired(req.companyId, req.params.id, req.agentToken);
        res.send(new ApiResponse(200, data, data.message));
        return;
    }
    const data = await agentHeartbeat(req.companyId, req.params.id, body);
    res.send(new ApiResponse(200, data, 'Heartbeat ok'));
});

export const ingest = asyncHandler(async (req, res) => {
    rejectScopedBody(req.body);
    const existing = await getAgentJob(req.companyId, req.params.id);
    if (isFacebookDirectAgentJob(existing)) {
        const data = await ingestFacebookDirectAgentRecords(req.companyId, req.params.id, {
            records: req.body?.records,
            currentPageUrl: req.body?.currentPageUrl,
            extractedCount: req.body?.extractedCount,
        });
        res.send(new ApiResponse(200, data, 'Facebook Direct Agent records ingested'));
        return;
    }
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
