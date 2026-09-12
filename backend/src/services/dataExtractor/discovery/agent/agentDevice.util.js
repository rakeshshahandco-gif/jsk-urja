/**
 * User + device binding for Discovery Agent.
 * Company-wide claim/failover is forbidden. Playwright/Google logic is unchanged.
 */
import crypto from 'crypto';
import { ApiError } from '../../../../utils/ApiError.js';
import { actorUserId, isDataExtractorAdmin } from '../../searchCampaign/simpleLeadSearch/simpleLeadSearch.ownership.util.js';

export const AGENT_PRESENCE_WINDOW_MS = 45 * 1000;
export const LOCAL_DEVICE_OFFLINE_MESSAGE = 'Discovery Agent is not connected on this computer. Start the Discovery Agent on this PC to begin extraction.';
export const LOCAL_DEVICE_OFFLINE_SHORT = 'Discovery Agent is offline on this computer.';
export const SELECT_DEVICE_MESSAGE = 'Select which computer should run this extraction.';

export function normalizeDeviceId(value) {
    return String(value || '').trim().slice(0, 80);
}

export function normalizeDeviceName(value) {
    return String(value || '').trim().replace(/[\r\n]+/g, ' ').slice(0, 120);
}

export function normalizeHostname(value) {
    return String(value || '').trim().replace(/[\r\n]+/g, ' ').slice(0, 120);
}

export function tokenOwnerId(token) {
    return token?.userId || token?.createdBy || null;
}

export function isAgentTokenOnline(token, now = Date.now()) {
    const hb = token?.lastHeartbeatAt || token?.lastUsedAt;
    if (!hb) return false;
    const ts = new Date(hb).getTime();
    return Number.isFinite(ts) && (now - ts) <= AGENT_PRESENCE_WINDOW_MS;
}

export function fallbackLegacyDeviceId(token) {
    const id = token?._id != null ? String(token._id) : '';
    return id ? `legacy-${id}` : '';
}

export function assignmentFromToken(token) {
    if (!token) return null;
    const deviceId = normalizeDeviceId(token.deviceId) || fallbackLegacyDeviceId(token);
    const deviceName = normalizeDeviceName(token.deviceName || token.hostname || token.name) || 'Windows-PC';
    return {
        assignedAgentTokenId: token._id || token.id || null,
        assignedAgentId: String(token.metadata?.lastAgentInstanceId || '').slice(0, 120),
        assignedDeviceId: deviceId,
        assignedDeviceName: deviceName,
        userId: tokenOwnerId(token),
        userName: String(token.userName || '').trim(),
    };
}

/**
 * Strict claim rule: assigned device/token wins.
 * Unassigned legacy sessions may be claimed only by the run owner’s agent.
 * Another user’s agent never matches.
 */
export function tokenMayClaimSession(token, session) {
    if (!token || !session) return false;
    const owner = tokenOwnerId(token);
    const assignedTokenId = session.assignedAgentTokenId ? String(session.assignedAgentTokenId) : '';
    const assignedDeviceId = normalizeDeviceId(session.assignedDeviceId);
    const tokenId = token._id != null ? String(token._id) : '';
    const tokenDeviceId = normalizeDeviceId(token.deviceId) || (tokenId ? fallbackLegacyDeviceId(token) : '');

    if (assignedTokenId || assignedDeviceId) {
        const tokenOk = assignedTokenId && tokenId && assignedTokenId === tokenId;
        const deviceOk = assignedDeviceId && tokenDeviceId && assignedDeviceId === tokenDeviceId;
        return Boolean(tokenOk || deviceOk);
    }

    if (!owner) return false;
    if (session.createdBy && String(session.createdBy) !== String(owner)) return false;
    return true;
}

export function assertTokenMayClaimSession(token, session) {
    if (!tokenMayClaimSession(token, session)) {
        throw new ApiError(403, 'This extraction is assigned to another user or computer');
    }
}

export function queuedSessionFilterForToken(companyId, token) {
    const owner = tokenOwnerId(token);
    const tokenId = token?._id != null ? token._id : null;
    const deviceId = normalizeDeviceId(token?.deviceId) || (tokenId ? fallbackLegacyDeviceId(token) : '');
    const or = [];
    if (tokenId) or.push({ assignedAgentTokenId: tokenId });
    if (deviceId) or.push({ assignedDeviceId: deviceId });
    if (owner) {
        or.push({
            createdBy: owner,
            $and: [
                { $or: [{ assignedDeviceId: { $in: [null, ''] } }, { assignedDeviceId: { $exists: false } }] },
                { $or: [{ assignedAgentTokenId: null }, { assignedAgentTokenId: { $exists: false } }] },
            ],
        });
    }
    const filter = { companyId, status: 'queued' };
    if (or.length) filter.$or = or;
    return filter;
}

export function reclaimableSessionFilterForToken(companyId, token, extra = {}) {
    const base = queuedSessionFilterForToken(companyId, token);
    delete base.status;
    return {
        companyId,
        ...extra,
        $and: [
            { $or: base.$or || [{ companyId }] },
        ],
    };
}

export function mapTokenDeviceRow(token, now = Date.now()) {
    const online = isAgentTokenOnline(token, now);
    const deviceName = normalizeDeviceName(token.deviceName || token.hostname || token.name) || 'Windows-PC';
    const deviceId = normalizeDeviceId(token.deviceId) || fallbackLegacyDeviceId(token);
    return {
        agentTokenId: token._id != null ? String(token._id) : null,
        deviceId,
        deviceName,
        hostname: normalizeHostname(token.hostname),
        userId: tokenOwnerId(token) ? String(tokenOwnerId(token)) : null,
        userName: String(token.userName || '').trim(),
        online,
        lastHeartbeatAt: token.lastHeartbeatAt || token.lastUsedAt || null,
        status: online ? 'ready' : 'offline',
    };
}

export function pickStartToken({ tokens = [], preferredDeviceId = '', assignedAgentTokenId = '', requireOnline = true } = {}) {
    const rows = Array.isArray(tokens) ? tokens : [];
    if (!rows.length) return { token: null, reason: 'none' };
    const prefDevice = normalizeDeviceId(preferredDeviceId);
    const prefToken = assignedAgentTokenId ? String(assignedAgentTokenId) : '';
    let chosen = null;
    if (prefToken) {
        chosen = rows.find((t) => String(t._id || t.id || '') === prefToken) || null;
    } else if (prefDevice) {
        chosen = rows.find((t) => (normalizeDeviceId(t.deviceId) || fallbackLegacyDeviceId(t)) === prefDevice) || null;
    } else {
        const online = rows.filter((t) => isAgentTokenOnline(t));
        if (online.length === 1) chosen = online[0];
        else if (online.length > 1) return { token: null, reason: 'select' };
        else if (rows.length === 1) chosen = rows[0];
        else return { token: null, reason: 'select' };
    }
    if (!chosen) return { token: null, reason: 'missing' };
    if (requireOnline && !isAgentTokenOnline(chosen)) return { token: chosen, reason: 'offline' };
    return { token: chosen, reason: 'ok' };
}

export function assertOwnTokenForStart(user, token) {
    const uid = actorUserId(user);
    const owner = tokenOwnerId(token);
    if (!uid || !owner || String(uid) !== String(owner)) {
        throw new ApiError(403, 'Start Extraction must use your own Discovery Agent on this computer.');
    }
}

export function startAssignmentError(reason) {
    if (reason === 'select') return new ApiError(400, SELECT_DEVICE_MESSAGE);
    return new ApiError(409, LOCAL_DEVICE_OFFLINE_MESSAGE);
}

export function newDeviceId() {
    return `pc-${crypto.randomBytes(8).toString('hex')}`;
}

export function isSafeDeviceTransferStatus(session) {
    if (!session) return false;
    if (session.dataRetentionStatus === 'DATA_DELETED') return false;
    const ac = String(session.autoCollection?.status || '');
    const ap = String(session.autoProcessing?.status || '');
    if (ap === 'running') return false;
    if (ac === 'running') return false;
    if (['queued', 'agent_assigned', 'opening', 'capturing'].includes(session.status) && !String(ac).startsWith('paused')) {
        return false;
    }
    return String(ac).startsWith('paused')
        || ['paused_owner', 'paused_manual', 'paused_batch', 'paused', 'stopped'].includes(ac)
        || ['cancelled', 'failed'].includes(session.status);
}

export function assertAdminMayTransfer(user, session) {
    if (!isDataExtractorAdmin(user)) {
        throw new ApiError(403, 'Only an admin can transfer the extraction device');
    }
    if (!isSafeDeviceTransferStatus(session)) {
        throw new ApiError(409, 'Pause or stop this extraction before transferring the device');
    }
}
