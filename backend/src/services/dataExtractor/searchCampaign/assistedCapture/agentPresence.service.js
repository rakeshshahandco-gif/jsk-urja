import mongoose from 'mongoose';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { DiscoveryAgentToken } from '../../../../models/discoveryAgentToken.model.js';
import { ApiError } from '../../../../utils/ApiError.js';

const PRESENCE_WINDOW_MS = 45 * 1000;

const BUSY_SESSION_STATUSES = Object.freeze(['opening', 'capturing', 'agent_assigned']);

const SESSION_UI_LABELS = Object.freeze({
    created: 'Created',
    queued: 'Queued — waiting for agent',
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
 */
export async function touchAgentPresence(companyId, agentTokenId, agentInstanceId) {
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

    doc.lastUsedAt = new Date();
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
        serverTime: new Date(),
    };
}

/**
 * Company-scoped agent status for Simple Lead Search UI.
 * - offline: no active token lastUsedAt within 45s
 * - busy: session in opening | capturing | agent_assigned
 * - connected: otherwise
 */
export async function getAgentStatusForCompany(companyId, { sessionId } = {}) {
    requireObjectId(companyId, 'Company');
    const now = Date.now();
    const cutoff = new Date(now - PRESENCE_WINDOW_MS);

    const activeToken = await DiscoveryAgentToken.findOne({
        companyId,
        isActive: true,
        revokedAt: null,
        lastUsedAt: { $gte: cutoff },
    })
        .sort({ lastUsedAt: -1 })
        .select('_id lastUsedAt name')
        .lean();

    const busySession = await AssistedCaptureSession.findOne({
        companyId,
        status: { $in: BUSY_SESSION_STATUSES },
    })
        .sort({ updatedAt: -1 })
        .select('_id status')
        .lean();

    let status = 'offline';
    if (activeToken) {
        status = busySession ? 'busy' : 'connected';
    }

    let sessionLabel = null;
    let sessionStatus = null;
    if (sessionId) {
        requireObjectId(sessionId, 'Assisted capture session');
        const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId })
            .select('_id status')
            .lean();
        if (session) {
            sessionStatus = session.status;
            sessionLabel = SESSION_UI_LABELS[session.status] || session.status;
        }
    }

    return {
        status,
        online: status !== 'offline',
        busy: status === 'busy',
        lastUsedAt: activeToken?.lastUsedAt || null,
        agentTokenId: activeToken ? String(activeToken._id) : null,
        activeBusySessionId: busySession ? String(busySession._id) : null,
        sessionId: sessionId ? String(sessionId) : null,
        sessionStatus,
        sessionLabel,
        presenceWindowSeconds: 45,
        serverTime: new Date(now),
    };
}
