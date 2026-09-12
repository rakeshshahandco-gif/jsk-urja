import mongoose from 'mongoose';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { DiscoveryAgentToken } from '../../../../models/discoveryAgentToken.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import {
    AGENT_PRESENCE_WINDOW_MS,
    LOCAL_DEVICE_OFFLINE_MESSAGE,
    assignmentFromToken,
    assertOwnTokenForStart,
    fallbackLegacyDeviceId,
    isAgentTokenOnline,
    mapTokenDeviceRow,
    normalizeDeviceId,
    normalizeDeviceName,
    normalizeHostname,
    pickStartToken,
    startAssignmentError,
    tokenOwnerId,
} from '../../discovery/agent/agentDevice.util.js';
import { actorUserId } from '../simpleLeadSearch/simpleLeadSearch.ownership.util.js';

const PRESENCE_WINDOW_MS = AGENT_PRESENCE_WINDOW_MS;

const BUSY_SESSION_STATUSES = Object.freeze(['opening', 'capturing', 'agent_assigned']);

const SESSION_UI_LABELS = Object.freeze({
    created: 'Created',
    queued: 'Waiting for discovery service',
    agent_assigned: 'Agent assigned',
    opening: 'Opening Google',
    awaiting_user: 'Google Ready',
    manual_action_required: 'Manual action required in the Google window',
    ready_to_capture: 'Ready to Capture',
    capturing: 'Capture in Progress',
    completed: 'Session Completed',
    cancelled: 'Session Stopped',
    expired: 'Session Ended',
    failed: 'Session Failed — agent did not claim or Google did not open',
});

export { SESSION_UI_LABELS };

function requireObjectId(id, label) {
    if (!id || !mongoose.isValidObjectId(id)) throw new ApiError(404, `${label} not found`);
}

/**
 * Touch DiscoveryAgentToken.lastUsedAt for presence heartbeats.
 * First connect binds this existing token to the local user/device without minting a new secret.
 */
export async function touchAgentPresence(companyId, agentTokenId, agentInstanceId, extras = {}) {
    requireObjectId(companyId, 'Company');
    requireObjectId(agentTokenId, 'Agent token');
    const safeInstance = String(agentInstanceId || '').trim().slice(0, 120);

    const doc = await DiscoveryAgentToken.findOne({
        _id: agentTokenId,
        companyId,
        isActive: true,
        revokedAt: null,
    });
    if (!doc) throw new ApiError(401, 'Discovery agent token rejected');

    const now = new Date();
    doc.lastUsedAt = now;
    doc.lastHeartbeatAt = now;
    if (!doc.userId && doc.createdBy) doc.userId = doc.createdBy;
    if (extras.userName && !doc.userName) doc.userName = String(extras.userName).trim().slice(0, 160);
    const incomingDeviceId = normalizeDeviceId(extras.deviceId);
    if (!doc.deviceId) {
        doc.deviceId = incomingDeviceId || fallbackLegacyDeviceId(doc);
    }
    const incomingName = normalizeDeviceName(extras.deviceName || extras.hostname);
    if (!doc.deviceName && incomingName) doc.deviceName = incomingName;
    const incomingHost = normalizeHostname(extras.hostname);
    if (incomingHost) doc.hostname = incomingHost;
    if (extras.version) doc.agentVersion = String(extras.version).trim().slice(0, 40);
    if (extras.applicationKey && !doc.applicationKey) {
        doc.applicationKey = String(extras.applicationKey).trim().slice(0, 80);
    }
    if (safeInstance) {
        doc.metadata = {
            ...(doc.metadata && typeof doc.metadata === 'object' ? doc.metadata : {}),
            lastAgentInstanceId: safeInstance,
        };
    }
    await doc.save();

    return {
        ok: true,
        companyId: String(companyId),
        agentTokenId: String(doc._id),
        agentInstanceId: safeInstance || null,
        lastUsedAt: doc.lastUsedAt,
        lastHeartbeatAt: doc.lastHeartbeatAt,
        deviceId: doc.deviceId || '',
        deviceName: doc.deviceName || '',
        userId: doc.userId ? String(doc.userId) : null,
        serverTime: new Date(),
    };
}

function displayLabels(deviceName = '') {
    const suffix = deviceName ? ` — ${deviceName}` : '';
    return {
        ready: `Discovery Agent: Ready${suffix}`,
        busy: `Discovery Agent: Busy${suffix}`,
        offline: deviceName ? `Discovery Agent: Offline on this device` : 'Discovery Agent: Offline',
        error: 'Discovery Agent: Error',
    };
}

function buildStatusPayload({
    status,
    token,
    session = null,
    sessionId = null,
    devices = [],
    preferredDeviceId = '',
    canStartOnThisDevice = false,
    startBlockedReason = '',
    now = Date.now(),
}) {
    const deviceName = normalizeDeviceName(token?.deviceName || token?.hostname || session?.assignedDeviceName || '');
    const labels = displayLabels(deviceName);
    const displayStatus = status.toUpperCase();
    return {
        status,
        displayStatus,
        displayLabel: labels[status] || labels.offline,
        online: status === 'ready' || status === 'busy',
        busy: status === 'busy',
        connected: status === 'ready' || status === 'busy',
        lastUsedAt: token?.lastHeartbeatAt || token?.lastUsedAt || null,
        lastHeartbeatAt: token?.lastHeartbeatAt || token?.lastUsedAt || null,
        agentTokenId: token?._id ? String(token._id) : null,
        deviceId: token ? (normalizeDeviceId(token.deviceId) || fallbackLegacyDeviceId(token)) : (session?.assignedDeviceId || null),
        deviceName: deviceName || session?.assignedDeviceName || '',
        assignedDeviceId: session?.assignedDeviceId || null,
        assignedDeviceName: session?.assignedDeviceName || '',
        ownerUserId: session?.createdBy ? String(session.createdBy) : (tokenOwnerId(token) ? String(tokenOwnerId(token)) : null),
        ownerName: session?.createdByName || token?.userName || '',
        devices,
        preferredDeviceId: preferredDeviceId || '',
        canStartOnThisDevice: Boolean(canStartOnThisDevice),
        startBlockedReason: startBlockedReason || '',
        sessionId: sessionId ? String(sessionId) : (session?._id ? String(session._id) : null),
        sessionStatus: session?.status || null,
        sessionLabel: session ? (SESSION_UI_LABELS[session.status] || session.status) : null,
        presenceWindowSeconds: 45,
        serverTime: new Date(now),
    };
}

async function loadAssignedToken(companyId, session) {
    if (!session) return null;
    if (session.assignedAgentTokenId) {
        return DiscoveryAgentToken.findOne({
            _id: session.assignedAgentTokenId,
            companyId,
            isActive: true,
            revokedAt: null,
        }).lean();
    }
    if (session.assignedDeviceId) {
        return DiscoveryAgentToken.findOne({
            companyId,
            deviceId: session.assignedDeviceId,
            isActive: true,
            revokedAt: null,
        }).sort({ lastHeartbeatAt: -1, lastUsedAt: -1 }).lean();
    }
    return null;
}

/**
 * User/device-aware agent status.
 * When a run is assigned, only that device counts as online — another PC must not keep it Ready.
 */
export async function getAgentStatusForCompany(companyId, { sessionId, user, preferredDeviceId } = {}) {
    requireObjectId(companyId, 'Company');
    const now = Date.now();
    const cutoff = new Date(now - PRESENCE_WINDOW_MS);
    const uid = actorUserId(user);
    let session = null;
    if (sessionId) {
        requireObjectId(sessionId, 'Assisted capture session');
        session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId })
            .select('_id status failCode createdBy createdByName assignedAgentTokenId assignedDeviceId assignedDeviceName')
            .lean();
    }

    if (session && (session.assignedAgentTokenId || session.assignedDeviceId)) {
        const token = await loadAssignedToken(companyId, session);
        const assignedBusy = await AssistedCaptureSession.findOne({
            companyId,
            _id: session._id,
            status: { $in: BUSY_SESSION_STATUSES },
        }).select('_id status').lean();
        let status = 'offline';
        if (token && isAgentTokenOnline(token, now)) {
            status = assignedBusy ? 'busy' : 'ready';
        }
        if (status === 'offline' && session.status === 'failed' && session.failCode) {
            status = 'error';
        }
        return {
            ...buildStatusPayload({
                status,
                token,
                session,
                sessionId,
                devices: token ? [mapTokenDeviceRow(token, now)] : [],
                preferredDeviceId: session.assignedDeviceId || '',
                canStartOnThisDevice: false,
                now,
            }),
            activeBusySessionId: assignedBusy ? String(assignedBusy._id) : null,
        };
    }

    const userFilter = uid
        ? { companyId, isActive: true, revokedAt: null, $or: [{ userId: uid }, { createdBy: uid }] }
        : null;
    const userTokens = userFilter
        ? await DiscoveryAgentToken.find(userFilter).sort({ lastHeartbeatAt: -1, lastUsedAt: -1 }).lean()
        : [];
    const devices = userTokens.map((t) => mapTokenDeviceRow(t, now));
    const pref = normalizeDeviceId(preferredDeviceId);
    let selected = pref
        ? userTokens.find((t) => (normalizeDeviceId(t.deviceId) || fallbackLegacyDeviceId(t)) === pref)
        : userTokens.find((t) => isAgentTokenOnline(t, now)) || userTokens[0] || null;

    if (selected) {
        const myBusy = await AssistedCaptureSession.findOne({
            companyId,
            assignedAgentTokenId: selected._id,
            status: { $in: BUSY_SESSION_STATUSES },
        }).select('_id status').lean();
        const online = isAgentTokenOnline(selected, now);
        let status = online ? (myBusy ? 'busy' : 'ready') : 'offline';
        if (session && status === 'offline' && session.status === 'failed' && session.failCode) {
            status = 'error';
        }
        return {
            ...buildStatusPayload({
                status,
                token: selected,
                session,
                sessionId,
                devices,
                preferredDeviceId: pref || (selected ? (normalizeDeviceId(selected.deviceId) || fallbackLegacyDeviceId(selected)) : ''),
                canStartOnThisDevice: online,
                startBlockedReason: online ? '' : LOCAL_DEVICE_OFFLINE_MESSAGE,
                now,
            }),
            activeBusySessionId: myBusy ? String(myBusy._id) : null,
        };
    }

    if (uid) {
        const otherOnline = await DiscoveryAgentToken.findOne({
            companyId,
            isActive: true,
            revokedAt: null,
            $or: [
                { lastHeartbeatAt: { $gte: cutoff } },
                { lastUsedAt: { $gte: cutoff } },
            ],
        }).sort({ lastHeartbeatAt: -1, lastUsedAt: -1 }).lean();
        return {
            ...buildStatusPayload({
                status: 'offline',
                token: null,
                session,
                sessionId,
                devices,
                preferredDeviceId: pref,
                canStartOnThisDevice: false,
                startBlockedReason: LOCAL_DEVICE_OFFLINE_MESSAGE,
                now,
            }),
            activeBusySessionId: null,
            otherCompanyAgentOnline: Boolean(otherOnline && String(tokenOwnerId(otherOnline) || '') !== String(uid)),
        };
    }

    const activeToken = await DiscoveryAgentToken.findOne({
        companyId,
        isActive: true,
        revokedAt: null,
        $or: [
            { lastHeartbeatAt: { $gte: cutoff } },
            { lastUsedAt: { $gte: cutoff } },
        ],
    })
        .sort({ lastHeartbeatAt: -1, lastUsedAt: -1 })
        .lean();
    const busySession = await AssistedCaptureSession.findOne({
        companyId,
        status: { $in: BUSY_SESSION_STATUSES },
    })
        .sort({ updatedAt: -1 })
        .select('_id status')
        .lean();
    let status = 'offline';
    if (activeToken) status = busySession ? 'busy' : 'ready';
    if (session && status === 'offline' && session.status === 'failed' && session.failCode) {
        status = 'error';
    }
    return {
        ...buildStatusPayload({
            status,
            token: activeToken,
            session,
            sessionId,
            devices: [],
            now,
        }),
        activeBusySessionId: busySession ? String(busySession._id) : null,
    };
}

export async function resolveStartDeviceAssignment({ companyId, user, preferredDeviceId = '', assignedAgentTokenId = '' }) {
    requireObjectId(companyId, 'Company');
    const uid = actorUserId(user);
    if (!uid) throw new ApiError(403, 'Permission denied: user context required');
    const cutoff = new Date(Date.now() - PRESENCE_WINDOW_MS);
    const [userTokens, onlineTokens] = await Promise.all([
        DiscoveryAgentToken.find({
            companyId,
            isActive: true,
            revokedAt: null,
            $or: [{ userId: uid }, { createdBy: uid }],
        }).lean(),
        DiscoveryAgentToken.find({
            companyId,
            isActive: true,
            revokedAt: null,
            $or: [
                { lastHeartbeatAt: { $gte: cutoff } },
                { lastUsedAt: { $gte: cutoff } },
            ],
        }).lean(),
    ]);
    const otherUserOnline = onlineTokens.some((t) => String(tokenOwnerId(t) || '') !== String(uid));
    if (!userTokens.length) {
        if (otherUserOnline) throw new ApiError(409, LOCAL_DEVICE_OFFLINE_MESSAGE);
        return null;
    }
    const picked = pickStartToken({
        tokens: userTokens,
        preferredDeviceId,
        assignedAgentTokenId,
        requireOnline: true,
    });
    if (picked.reason !== 'ok') throw startAssignmentError(picked.reason);
    assertOwnTokenForStart(user, picked.token);
    return assignmentFromToken(picked.token);
}

export { assignmentFromToken };
