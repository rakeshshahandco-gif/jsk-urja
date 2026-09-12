import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    acknowledgeBrowserOpened,
    ackCaptureRequest,
    cancelAssistedCaptureSession,
    claimAssistedCaptureSession,
    completeAssistedByAgent,
    completeAssistedCaptureSessionByUser,
    continueAfterManualAction,
    createAssistedCaptureSession,
    failAssistedByAgent,
    getAssistedCaptureSession,
    getPendingCaptureRequest,
    heartbeatAssistedCapture,
    listAssistedCaptureSessions,
    loadClaimedSessionForAgent,
    pollQueuedSessionId,
    pollReclaimableAssistedSession,
    requestCaptureVisibleResults,
    setManualActionRequired,
    submitAgentAssistedEvent,
    touchAgentPresence,
    validateAgentSessionToken,
} from '../services/dataExtractor/searchCampaign/assistedCapture/index.js';
import {
    ackPendingNavigation,
    completePendingNavigation,
} from '../services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.multiQuery.service.js';

function sendSafeError(res, err) {
    if (err && err.errorCode === 'IDEMPOTENCY_KEY_REUSED') {
        return res.status(409).send({
            success: false,
            code: 409,
            errorCode: 'IDEMPOTENCY_KEY_REUSED',
            message: err.message || 'Idempotency key was previously used for a different request',
        });
    }
    const status = Number(err?.statusCode) || 500;
    const operational = Boolean(err?.isOperational) || status < 500;
    const message = operational ? String(err?.message || 'Request failed').slice(0, 500) : 'Request failed';
    return res.status(status).send({ success: false, code: status, message });
}

function withSafeErrors(handler) {
    return asyncHandler(async (req, res) => {
        try {
            await handler(req, res);
        } catch (err) {
            sendSafeError(res, err);
        }
    });
}

function requireCompany(req) {
    if (!req.companyId) throw new ApiError(400, 'Company context required');
    return req.companyId;
}

export const createSession = withSafeErrors(async (req, res) => {
    const data = await createAssistedCaptureSession({
        companyId: requireCompany(req),
        user: req.user,
        campaignId: req.params.campaignId,
        queryId: req.params.queryId,
        body: req.body,
        headers: req.headers,
    });
    const code = data.idempotentReplay ? 200 : 201;
    res.status(code).send(new ApiResponse(code, data, data.idempotentReplay ? 'Assisted capture session replay' : 'Assisted capture session created'));
});

export const listSessions = withSafeErrors(async (req, res) => {
    const data = await listAssistedCaptureSessions({
        companyId: requireCompany(req),
        user: req.user,
        campaignId: req.params.campaignId,
        queryId: req.params.queryId,
        query: req.query,
    });
    res.send(new ApiResponse(200, data, 'Assisted capture sessions'));
});

export const getSession = withSafeErrors(async (req, res) => {
    const session = await getAssistedCaptureSession({
        companyId: requireCompany(req),
        user: req.user,
        campaignId: req.params.campaignId,
        queryId: req.params.queryId,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, { session }, 'Assisted capture session'));
});

export const cancelSession = withSafeErrors(async (req, res) => {
    const session = await cancelAssistedCaptureSession({
        companyId: requireCompany(req),
        user: req.user,
        campaignId: req.params.campaignId,
        queryId: req.params.queryId,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, { session }, 'Assisted capture session cancelled'));
});

export const completeSession = withSafeErrors(async (req, res) => {
    const session = await completeAssistedCaptureSessionByUser({
        companyId: requireCompany(req),
        user: req.user,
        campaignId: req.params.campaignId,
        queryId: req.params.queryId,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, { session }, 'Assisted capture session completed'));
});

export const continueAfterManual = withSafeErrors(async (req, res) => {
    const session = await continueAfterManualAction({
        companyId: requireCompany(req),
        user: req.user,
        campaignId: req.params.campaignId,
        queryId: req.params.queryId,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, { session }, 'Continued after manual action'));
});

export const claim = withSafeErrors(async (req, res) => {
    const data = await claimAssistedCaptureSession({
        companyId: requireCompany(req),
        sessionId: req.body?.sessionId,
        agentInstanceId: req.body?.agentInstanceId,
        agentToken: req.agentToken || null,
    });
    res.send(new ApiResponse(200, data, 'Assisted capture session claimed'));
});

export const browserOpened = withSafeErrors(async (req, res) => {
    const data = await acknowledgeBrowserOpened({
        companyId: requireCompany(req),
        sessionId: req.params.sessionId,
        agentInstanceId: req.body?.agentInstanceId,
        token: req.headers['x-assisted-session-token'],
    });
    res.send(new ApiResponse(200, data, 'Browser open acknowledged'));
});

export const heartbeat = withSafeErrors(async (req, res) => {
    const data = await heartbeatAssistedCapture({
        companyId: requireCompany(req),
        sessionId: req.params.sessionId,
        agentInstanceId: req.body?.agentInstanceId,
        token: req.headers['x-assisted-session-token'],
        status: req.body?.status,
    });
    res.send(new ApiResponse(200, data, 'Heartbeat received'));
});

export const manualAction = withSafeErrors(async (req, res) => {
    const data = await setManualActionRequired({
        companyId: requireCompany(req),
        sessionId: req.params.sessionId,
        agentInstanceId: req.body?.agentInstanceId,
        token: req.headers['x-assisted-session-token'],
        message: req.body?.message,
    });
    res.send(new ApiResponse(200, data, 'Manual action required set'));
});

export const submitEvent = withSafeErrors(async (req, res) => {
    const data = await submitAgentAssistedEvent({
        companyId: requireCompany(req),
        sessionId: req.params.sessionId,
        agentInstanceId: req.body?.agentInstanceId,
        token: req.headers['x-assisted-session-token'],
        payload: req.body,
    });
    const code = data.idempotentReplay ? 200 : 201;
    res.status(code).send(new ApiResponse(code, data, data.idempotentReplay ? 'Assisted event replay' : 'Assisted event captured'));
});

export const completeByAgent = withSafeErrors(async (req, res) => {
    const data = await completeAssistedByAgent({
        companyId: requireCompany(req),
        sessionId: req.params.sessionId,
        agentInstanceId: req.body?.agentInstanceId,
        token: req.headers['x-assisted-session-token'],
    });
    res.send(new ApiResponse(200, data, 'Assisted capture completed by agent'));
});

export const failByAgent = withSafeErrors(async (req, res) => {
    const data = await failAssistedByAgent({
        companyId: requireCompany(req),
        sessionId: req.params.sessionId,
        agentInstanceId: req.body?.agentInstanceId,
        token: req.headers['x-assisted-session-token'],
        code: req.body?.code,
        message: req.body?.message,
    });
    res.send(new ApiResponse(200, data, 'Assisted capture failed by agent'));
});

export const requestCapture = withSafeErrors(async (req, res) => {
    const data = await requestCaptureVisibleResults({
        companyId: requireCompany(req),
        user: req.user,
        campaignId: req.params.campaignId,
        queryId: req.params.queryId,
        sessionId: req.params.sessionId,
        body: req.body || {},
    });
    const code = data.idempotentReplay ? 200 : 202;
    res.status(code).send(new ApiResponse(code, data, data.idempotentReplay ? 'Capture request replay' : 'Capture requested'));
});

export const presence = withSafeErrors(async (req, res) => {
    const tokenId = req.agentToken?._id || req.user?.agentTokenId;
    const data = await touchAgentPresence(
        requireCompany(req),
        tokenId,
        req.body?.agentInstanceId,
        {
            deviceId: req.body?.deviceId,
            deviceName: req.body?.deviceName,
            hostname: req.body?.hostname,
            version: req.body?.version,
            applicationKey: req.body?.applicationKey,
        },
    );
    res.send(new ApiResponse(200, data, 'Agent presence updated'));
});

export const pollQueued = withSafeErrors(async (req, res) => {
    const companyId = requireCompany(req);
    const token = req.agentToken || null;
    const queued = (await pollQueuedSessionId(companyId, token))
        || (await pollReclaimableAssistedSession(companyId, token));
    res.send(new ApiResponse(200, { queued }, queued ? 'Queued assisted session available' : 'No queued assisted session'));
});

export const getCaptureRequest = withSafeErrors(async (req, res) => {
    const companyId = requireCompany(req);
    const agentInstanceId = String(
        req.query?.agentInstanceId || req.body?.agentInstanceId || '',
    ).trim();
    if (!agentInstanceId) throw new ApiError(400, 'agentInstanceId is required');
    const session = await loadClaimedSessionForAgent({
        companyId,
        sessionId: req.params.sessionId,
        agentInstanceId,
    });
    await validateAgentSessionToken({
        companyId,
        session,
        tokenHeaderValue: req.headers['x-assisted-session-token'],
    });
    const data = await getPendingCaptureRequest({
        companyId,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, 'Capture request status'));
});

export const ackCaptureRequestHandler = withSafeErrors(async (req, res) => {
    const data = await ackCaptureRequest({
        companyId: requireCompany(req),
        sessionId: req.params.sessionId,
        agentInstanceId: req.body?.agentInstanceId,
        idempotencyKey: req.body?.idempotencyKey,
        token: req.headers['x-assisted-session-token'],
    });
    const code = data.idempotentReplay ? 200 : 200;
    res.status(code).send(new ApiResponse(code, data, data.idempotentReplay ? 'Capture ack replay' : 'Capture request acknowledged'));
});

export const ackNavigateRequestHandler = withSafeErrors(async (req, res) => {
    const companyId = requireCompany(req);
    const agentInstanceId = String(req.body?.agentInstanceId || '').trim();
    if (!agentInstanceId) throw new ApiError(400, 'agentInstanceId is required');
    const session = await loadClaimedSessionForAgent({
        companyId,
        sessionId: req.params.sessionId,
        agentInstanceId,
    });
    await validateAgentSessionToken({
        companyId,
        session,
        tokenHeaderValue: req.headers['x-assisted-session-token'],
    });
    const data = await ackPendingNavigation({
        companyId,
        sessionId: req.params.sessionId,
        agentInstanceId,
    });
    res.send(new ApiResponse(200, data, 'Navigation acknowledged'));
});

export const completeNavigateRequestHandler = withSafeErrors(async (req, res) => {
    const companyId = requireCompany(req);
    const agentInstanceId = String(req.body?.agentInstanceId || '').trim();
    if (!agentInstanceId) throw new ApiError(400, 'agentInstanceId is required');
    const session = await loadClaimedSessionForAgent({
        companyId,
        sessionId: req.params.sessionId,
        agentInstanceId,
    });
    await validateAgentSessionToken({
        companyId,
        session,
        tokenHeaderValue: req.headers['x-assisted-session-token'],
    });
    const data = await completePendingNavigation({
        companyId,
        sessionId: req.params.sessionId,
    });
    res.send(new ApiResponse(200, data, 'Navigation completed'));
});
