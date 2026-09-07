import mongoose from 'mongoose';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { AssistedCaptureEvent } from '../../../../models/assistedCaptureEvent.model.js';
import { SearchQuery } from '../../../../models/searchQuery.model.js';
import { DiscoveryAgentJob } from '../../../../models/discoveryAgentJob.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { AGENT_HEARTBEAT_STATUS_ALLOWED, SESSION_ALLOWED_TTL_MINUTES_MAX } from './constants.js';
import { submitAssistedCaptureEvent } from './event.service.js';
import { assertSessionTokenHeader, hashSessionToken, issueSessionToken } from './sessionToken.util.js';

const CHINA_ASSISTED_RECLAIM_SOURCES = Object.freeze(['1688', 'baidu', 'sogou', 'so360']);
const RECLAIMABLE_STATUSES = Object.freeze(['manual_action_required', 'opening', 'awaiting_user', 'agent_assigned']);
/** Queued campaigns wait for the discovery service instead of failing in 30s. */
const QUEUE_TIMEOUT_MS = 15 * 60 * 1000;
/** Stale in-flight sessions may be reclaimed after agent crash/restart. */
const STALE_HEARTBEAT_MS = 90 * 1000;

function requireObjectId(id, label) {
    if (!id || !mongoose.isValidObjectId(id)) throw new ApiError(404, `${label} not found`);
}

function sanitizeSession(session) {
    const plain = session.toObject ? session.toObject() : { ...session };
    delete plain.tokenHash;
    return plain;
}

export async function validateAgentSessionToken({ companyId, session, tokenHeaderValue }) {
    const plainToken = assertSessionTokenHeader(tokenHeaderValue);
    if (session.companyId.toString() !== String(companyId)) throw new ApiError(403, 'Token company mismatch');

    const nowTs = Date.now();
    if (session.sessionExpiresAt && new Date(session.sessionExpiresAt).getTime() < nowTs) {
        session.status = 'expired';
        await session.save().catch(() => null);
        throw new ApiError(401, 'Assisted session expired');
    }
    if (session.tokenExpiresAt && new Date(session.tokenExpiresAt).getTime() < nowTs) throw new ApiError(401, 'Assisted session token expired');

    const actual = hashSessionToken(plainToken);
    if (actual !== session.tokenHash) throw new ApiError(401, 'Invalid assisted session token');
}

/**
 * Poll newest queued assisted session for this company — does NOT claim.
 * Stale queued sessions (>30s unclaimed) are failed so they do not block forever.
 * Returns {_id, status, searchUrlHost} only (no token).
 */
export async function pollQueuedSessionId(companyId) {
    const cutoff = new Date(Date.now() - QUEUE_TIMEOUT_MS);
    await AssistedCaptureSession.updateMany(
        {
            companyId,
            status: 'queued',
            createdAt: { $lt: cutoff },
        },
        {
            $set: {
                status: 'failed',
                failedAt: new Date(),
                failCode: 'QUEUE_TIMEOUT',
                failMessage: 'No discovery service claimed this session within 15 minutes. Confirm the Discovery Agent is Ready, then click Retry.',
            },
        },
    );

    // Prefer the newest queued session (owner's latest Search & Capture)
    const session = await AssistedCaptureSession.findOne({ companyId, status: 'queued' })
        .sort({ createdAt: -1 })
        .select('_id status searchUrl')
        .lean();
    if (!session) return null;
    return pollSessionSummary(session);
}

function pollSessionSummary(session) {
    let searchUrlHost = '';
    try {
        searchUrlHost = new URL(String(session.searchUrl || '')).host || '';
    } catch {
        searchUrlHost = '';
    }
    return {
        _id: session._id,
        status: session.status,
        searchUrlHost,
    };
}

/**
 * Re-attach a live China assisted session whose visible browser died,
 * without creating a new campaign or queued child session.
 */
export async function pollReclaimableAssistedSession(companyId) {
    const staleCutoff = new Date(Date.now() - STALE_HEARTBEAT_MS);
    const session = await AssistedCaptureSession.findOne({
        companyId,
        status: { $in: RECLAIMABLE_STATUSES },
        $or: [
            { source: { $in: CHINA_ASSISTED_RECLAIM_SOURCES } },
            { lastHeartbeatAt: { $lt: staleCutoff } },
            { lastHeartbeatAt: null, updatedAt: { $lt: staleCutoff } },
        ],
    })
        .sort({ updatedAt: -1 })
        .select('_id status searchUrl source')
        .lean();
    if (!session) return null;
    return pollSessionSummary(session);
}

/** Alias used by listen flow: poll then claim separately. */
export async function pollQueuedAssistedCapture({ companyId }) {
    return pollQueuedSessionId(companyId);
}

async function reclaimAssistedCaptureSession({ companyId, sessionId, agentInstanceId }) {
    const now = new Date();
    const issued = issueSessionToken(now, SESSION_ALLOWED_TTL_MINUTES_MAX);
    const staleCutoff = new Date(now.getTime() - STALE_HEARTBEAT_MS);
    const $set = {
        agentId: agentInstanceId,
        tokenHash: issued.hash,
        tokenExpiresAt: issued.expiresAt,
        tokenDeliveredAt: now,
        sessionExpiresAt: new Date(now.getTime() + SESSION_ALLOWED_TTL_MINUTES_MAX * 60 * 1000),
        lastHeartbeatAt: now,
    };

    const session = await AssistedCaptureSession.findOneAndUpdate(
        {
            companyId,
            _id: sessionId,
            status: { $in: RECLAIMABLE_STATUSES },
            $or: [
                { source: { $in: CHINA_ASSISTED_RECLAIM_SOURCES } },
                { lastHeartbeatAt: { $lt: staleCutoff } },
                { lastHeartbeatAt: null, updatedAt: { $lt: staleCutoff } },
            ],
        },
        { $set },
        { new: true },
    );
    if (!session) return null;
    return { session: sanitizeSession(session), sessionToken: issued.plain, reclaimed: true };
}

export async function claimAssistedCaptureSession({ companyId, sessionId, agentInstanceId }) {
    const safeAgentId = String(agentInstanceId || '').trim().slice(0, 120);
    if (!safeAgentId) throw new ApiError(400, 'agentInstanceId is required');

    const filter = { companyId, status: 'queued' };
    if (sessionId) {
        requireObjectId(sessionId, 'Assisted capture session');
        filter._id = sessionId;
    }

    const session = await AssistedCaptureSession.findOneAndUpdate(
        filter,
        { $set: { agentId: safeAgentId, status: 'agent_assigned' } },
        { sort: { createdAt: 1 }, new: true },
    );
    if (!session) {
        if (sessionId) {
            const reclaimed = await reclaimAssistedCaptureSession({
                companyId,
                sessionId,
                agentInstanceId: safeAgentId,
            });
            if (reclaimed) return reclaimed;
        }
        throw new ApiError(404, 'No queued assisted capture session found');
    }

    let sessionToken = null;
    if (!session.tokenDeliveredAt) {
        const job = await DiscoveryAgentJob.findOne({ _id: session.discoveryAgentJobId, companyId });
        const tokenPlain = job?.metadata?.pendingSessionToken;
        if (!tokenPlain) {
            throw new ApiError(500, 'Assisted session token not available');
        }

        session.tokenDeliveredAt = new Date();
        sessionToken = tokenPlain;
        await session.save();

        if (job) {
            await DiscoveryAgentJob.findOneAndUpdate(
                { _id: job._id, companyId },
                { $unset: { 'metadata.pendingSessionToken': 1 } },
            );
        }
    }

    return sessionToken
        ? { session: sanitizeSession(session), sessionToken }
        : { session: sanitizeSession(session) };
}

export async function loadClaimedSessionForAgent({ companyId, sessionId, agentInstanceId }) {
    requireObjectId(sessionId, 'Assisted capture session');
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId });
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    const safeAgentId = String(agentInstanceId || '').trim().slice(0, 120);
    if (!safeAgentId) throw new ApiError(400, 'agentInstanceId is required');
    if (session.agentId && session.agentId !== safeAgentId) throw new ApiError(403, 'Session is assigned to another agent instance');
    return session;
}

export async function acknowledgeBrowserOpened({ companyId, sessionId, agentInstanceId, token }) {
    const session = await loadClaimedSessionForAgent({ companyId, sessionId, agentInstanceId });
    // Every agent route (except /claim) requires the assistant session token header.
    await validateAgentSessionToken({
        companyId,
        session,
        tokenHeaderValue: token,
    });
    if (!session.browserOpenedAcked) {
        session.browserOpenedAcked = true;
        session.openedAt = new Date();
        session.status = 'awaiting_user';
        await session.save();

        const query = await SearchQuery.findOne({ _id: session.queryId, companyId, campaignId: session.campaignId });
        if (query) {
            query.openedCount = Number(query.openedCount || 0) + 1;
            query.lastOpenedAt = new Date();
            query.lastOpenedBy = session.createdBy || query.lastOpenedBy;
            if (query.status === 'approved' || query.status === 'opened') query.status = 'opened';
            // captured status must remain captured
            await query.save();
        }
    }
    return { session: sanitizeSession(session), browserOpenedAcked: true };
}

export async function heartbeatAssistedCapture({ companyId, sessionId, agentInstanceId, token, status }) {
    const session = await loadClaimedSessionForAgent({ companyId, sessionId, agentInstanceId });
    await validateAgentSessionToken({ companyId, session, tokenHeaderValue: token });
    const nextStatus = String(status || '').trim();
    if (nextStatus && !AGENT_HEARTBEAT_STATUS_ALLOWED.includes(nextStatus)) {
        throw new ApiError(400, 'Unsupported heartbeat status');
    }

    const now = new Date();
    const $set = { lastHeartbeatAt: now, updatedAt: now };
    // Heartbeat must never clobber terminal states or overwrite capture counters.
    // Only advance ephemeral agent presence statuses when session is still in-flight.
    const terminal = ['completed', 'cancelled', 'expired', 'failed'];
    const filter = {
        _id: session._id,
        companyId,
        status: { $nin: terminal },
    };
    if (nextStatus) {
        // Do not demote capturing/manual_action_required/ready back incorrectly from weaker heartbeats
        // except when agent explicitly reports those allowed statuses.
        $set.status = nextStatus;
    }

    const updated = await AssistedCaptureSession.findOneAndUpdate(
        filter,
        { $set },
        { new: true },
    );
    // If session already terminal, still touch heartbeat timestamp only (no status overwrite)
    if (!updated) {
        const terminalDoc = await AssistedCaptureSession.findOneAndUpdate(
            { _id: session._id, companyId, status: { $in: terminal } },
            { $set: { lastHeartbeatAt: now, updatedAt: now } },
            { new: true },
        );
        return { session: sanitizeSession(terminalDoc || session) };
    }
    return { session: sanitizeSession(updated) };
}

export async function setManualActionRequired({ companyId, sessionId, agentInstanceId, token, message }) {
    const session = await loadClaimedSessionForAgent({ companyId, sessionId, agentInstanceId });
    await validateAgentSessionToken({
        companyId,
        session,
        tokenHeaderValue: token,
    });
    const terminal = ['completed', 'cancelled', 'expired', 'failed'];
    if (terminal.includes(session.status) || session.autoCollection?.ownerStoppedAt || session.autoCollection?.stopRequested) {
        return { session: sanitizeSession(session), ignored: true, reason: 'session_stopped' };
    }
    session.status = 'manual_action_required';
    session.manualActionMessage = String(message || 'Manual action required').replace(/[\r\n]+/g, ' ').slice(0, 500);
    session.lastHeartbeatAt = new Date();
    await session.save();
    return { session: sanitizeSession(session) };
}

export async function submitAgentAssistedEvent({ companyId, sessionId, agentInstanceId, token, payload }) {
    const session = await loadClaimedSessionForAgent({ companyId, sessionId, agentInstanceId });
    await validateAgentSessionToken({ companyId, session, tokenHeaderValue: token });
    if (['completed', 'cancelled', 'expired', 'failed'].includes(session.status)) {
        throw new ApiError(400, `Session status ${session.status} cannot accept capture events`);
    }
    return submitAssistedCaptureEvent({ companyId, session, agentInstanceId, payload });
}

export async function completeAssistedByAgent({ companyId, sessionId, agentInstanceId, token }) {
    const session = await loadClaimedSessionForAgent({ companyId, sessionId, agentInstanceId });
    await validateAgentSessionToken({ companyId, session, tokenHeaderValue: token });
    if (!['completed', 'cancelled', 'expired', 'failed'].includes(session.status)) {
        session.status = 'completed';
        session.completedAt = new Date();
        await session.save();
    }
    return { session: sanitizeSession(session) };
}

export async function failAssistedByAgent({ companyId, sessionId, agentInstanceId, token, code, message }) {
    const session = await loadClaimedSessionForAgent({ companyId, sessionId, agentInstanceId });
    await validateAgentSessionToken({ companyId, session, tokenHeaderValue: token });

    const failCodeIn = String(code || 'AGENT_FAILED').slice(0, 80);
    const failMessageIn = String(message || 'Assisted capture failed').replace(/[\r\n]+/g, ' ').slice(0, 500);
    const pageKindMatch = failMessageIn.match(/Page kind:\s*([a-z0-9_]+)/i);
    const pageKind = pageKindMatch ? String(pageKindMatch[1]).toLowerCase() : '';
    const isPageOutcome = ['UNSUPPORTED_LAYOUT', 'NO_ORGANIC_RESULTS', 'NO_PARSER_RESULTS'].includes(failCodeIn)
        || /Page kind:/i.test(failMessageIn);

    // Page-kind / empty-parser outcomes must not be ignored just because earlier pages accepted records.
    // Ignoring them left campaigns looping on the same Google page after a successful ingest.
    if (isPageOutcome) {
        const human = ['consent', 'captcha', 'login'].includes(pageKind);
        const updated = await AssistedCaptureSession.findOneAndUpdate(
            { _id: session._id, companyId, status: { $nin: ['completed', 'cancelled', 'expired'] } },
            {
                $set: {
                    status: human ? 'manual_action_required' : 'awaiting_user',
                    failCode: failCodeIn,
                    failMessage: failMessageIn,
                    manualActionMessage: human
                        ? `Human verification required (${pageKind}). Resolve in the Google window.`
                        : (session.manualActionMessage || ''),
                    pendingCaptureStatus: 'none',
                    pendingCaptureAckedAt: null,
                    lastHeartbeatAt: new Date(),
                    'autoCollection.lastErrorCode': failCodeIn,
                    'autoCollection.lastErrorMessage': failMessageIn,
                    'autoCollection.discoveryStatus': human ? 'paused' : 'running',
                    'autoCollection.providerState': human ? 'Human Verification' : 'Retry',
                    'autoCollection.pauseReason': human ? 'provider_block' : 'unsupported_page_retry',
                },
            },
            { new: true },
        );
        return { session: sanitizeSession(updated || session), ignoredFail: false, pageOutcome: true };
    }

    // Do not fail a session that already accepted capture events — bookkeeping/agent errors are non-fatal.
    const accepted = Number(session.acceptedCount || 0);
    const hasTerminalEvents = await AssistedCaptureEvent.countDocuments({
        companyId,
        sessionId: session._id,
        status: { $in: ['completed', 'partially_completed'] },
    });
    if (accepted > 0 || hasTerminalEvents > 0) {
        const updated = await AssistedCaptureSession.findOneAndUpdate(
            { _id: session._id, companyId, status: { $nin: ['completed', 'cancelled', 'expired'] } },
            {
                $set: {
                    status: 'awaiting_user',
                    'autoCollection.lastErrorCode': 'agent_fail_ignored_after_accepted_ingest',
                    'autoCollection.lastErrorMessage': String(message || code || 'ignored').slice(0, 500),
                    'autoCollection.discoveryStatus': 'running',
                    lastHeartbeatAt: new Date(),
                },
            },
            { new: true },
        );
        return { session: sanitizeSession(updated || session), ignoredFail: true };
    }

    const failCode = String(code || 'AGENT_FAILED').slice(0, 80);
    const failMessage = String(message || 'Assisted capture failed').replace(/[\r\n]+/g, ' ').slice(0, 500);
    const updated = await AssistedCaptureSession.findOneAndUpdate(
        { _id: session._id, companyId, status: { $nin: ['completed', 'cancelled', 'expired'] } },
        {
            $set: {
                status: 'failed',
                failedAt: new Date(),
                failCode,
                failMessage,
                'autoCollection.lastErrorCode': failCode,
                'autoCollection.lastErrorMessage': failMessage,
                'autoCollection.discoveryStatus': 'failed',
            },
        },
        { new: true },
    );
    return { session: sanitizeSession(updated || session) };
}
