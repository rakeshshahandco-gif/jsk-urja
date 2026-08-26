import mongoose from 'mongoose';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { checkUserPermission } from '../../../../utils/permissionUtils.js';
import {
    PERM_ASSISTED_MANAGE,
    PERM_ASSISTED_START,
} from './constants.js';
import { actorUserId, assertAssistedCaptureStart, assertAssistedCaptureManage } from './permissions.util.js';
import { loadClaimedSessionForAgent, validateAgentSessionToken } from './agentAdapter.service.js';

const BROWSER_OPEN_STATUSES = Object.freeze([
    'awaiting_user',
    'ready_to_capture',
    'manual_action_required',
    'capturing',
]);

function requireObjectId(id, label) {
    if (!id || !mongoose.isValidObjectId(id)) throw new ApiError(404, `${label} not found`);
}

function sanitizeSession(session) {
    const plain = session.toObject ? session.toObject() : { ...session };
    delete plain.tokenHash;
    return plain;
}

function assertStartOrManage(user) {
    if (checkUserPermission(user, PERM_ASSISTED_MANAGE)) return;
    if (checkUserPermission(user, PERM_ASSISTED_START)) {
        assertAssistedCaptureStart(user);
        return;
    }
    assertAssistedCaptureManage(user);
}

function pendingSnapshot(session) {
    return {
        pendingCaptureStatus: session.pendingCaptureStatus || 'none',
        pendingCaptureIdempotencyKey: session.pendingCaptureIdempotencyKey || '',
        pendingCaptureRequestedAt: session.pendingCaptureRequestedAt || null,
        pendingCaptureRequestedBy: session.pendingCaptureRequestedBy || null,
        pendingCaptureAckedAt: session.pendingCaptureAckedAt || null,
    };
}

export async function requestCaptureVisibleResults({
    companyId,
    user,
    campaignId,
    queryId,
    sessionId,
    body,
}) {
    assertStartOrManage(user);
    requireObjectId(campaignId, 'Search campaign');
    requireObjectId(queryId, 'Search query');
    requireObjectId(sessionId, 'Assisted capture session');

    if (Object.prototype.hasOwnProperty.call(body || {}, 'companyId')) {
        throw new ApiError(400, 'body.companyId is not allowed');
    }

    const idempotencyKey = String(body?.idempotencyKey || '').trim();
    if (!idempotencyKey) throw new ApiError(400, 'idempotencyKey is required');

    const session = await AssistedCaptureSession.findOne({
        _id: sessionId,
        companyId,
        campaignId,
        queryId,
    });
    if (!session) throw new ApiError(404, 'Assisted capture session not found');

    const ac = session.autoCollection || {};
    if (
        session.status === 'cancelled'
        || ac.ownerStoppedAt
        || ac.stopRequested === true
        || String(ac.summary?.stopReason || '') === 'owner_stop'
    ) {
        throw new ApiError(400, 'STOPPED BY USER. Capture will not continue.');
    }

    if (!BROWSER_OPEN_STATUSES.includes(session.status)) {
        throw new ApiError(
            400,
            'Session must be awaiting_user, ready_to_capture, manual_action_required, or capturing to request capture',
        );
    }

    const currentStatus = session.pendingCaptureStatus || 'none';
    const currentKey = String(session.pendingCaptureIdempotencyKey || '').trim();

    // Same key already used (pending/acked/consumed, or cleared-to-none after consume) → idempotent replay
    if (currentKey && currentKey === idempotencyKey) {
        return {
            session: sanitizeSession(session),
            pendingCapture: pendingSnapshot(session),
            idempotentReplay: true,
        };
    }

    if (['pending', 'acked'].includes(currentStatus) && currentKey && currentKey !== idempotencyKey) {
        throw new ApiError(409, 'A different capture request is already pending for this session');
    }

    session.pendingCaptureIdempotencyKey = idempotencyKey;
    session.pendingCaptureRequestedAt = new Date();
    session.pendingCaptureRequestedBy = actorUserId(user);
    session.pendingCaptureStatus = 'pending';
    session.pendingCaptureAckedAt = null;
    session.updatedBy = actorUserId(user);
    await session.save();

    return {
        session: sanitizeSession(session),
        pendingCapture: pendingSnapshot(session),
        idempotentReplay: false,
    };
}

export async function ackCaptureRequest({
    companyId,
    sessionId,
    agentInstanceId,
    idempotencyKey,
    token,
}) {
    const session = await loadClaimedSessionForAgent({ companyId, sessionId, agentInstanceId });
    await validateAgentSessionToken({ companyId, session, tokenHeaderValue: token });

    const key = String(idempotencyKey || '').trim();
    if (!key) throw new ApiError(400, 'idempotencyKey is required');

    const currentKey = String(session.pendingCaptureIdempotencyKey || '').trim();
    const currentStatus = session.pendingCaptureStatus || 'none';

    if (currentKey === key && (currentStatus === 'acked' || currentStatus === 'consumed')) {
        return {
            session: sanitizeSession(session),
            pendingCapture: pendingSnapshot(session),
            idempotentReplay: true,
        };
    }
    if (currentStatus !== 'pending' || currentKey !== key) {
        throw new ApiError(409, 'No matching pending capture request to acknowledge');
    }

    session.pendingCaptureStatus = 'acked';
    session.pendingCaptureAckedAt = new Date();
    await session.save();

    return {
        session: sanitizeSession(session),
        pendingCapture: pendingSnapshot(session),
        idempotentReplay: false,
    };
}

/**
 * Mark capture request consumed after successful event or when agent starts capturing.
 * Clears active pending status to 'none' (agent poll returns no pending). Keeps key
 * so the same idempotencyKey cannot create a second pending request.
 */
export async function consumeCaptureRequest({ companyId, sessionId, idempotencyKey }) {
    requireObjectId(sessionId, 'Assisted capture session');
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId });
    if (!session) throw new ApiError(404, 'Assisted capture session not found');

    const key = String(idempotencyKey || session.pendingCaptureIdempotencyKey || '').trim();
    const currentKey = String(session.pendingCaptureIdempotencyKey || '').trim();
    const currentStatus = session.pendingCaptureStatus || 'none';

    if (currentStatus === 'none' && !currentKey) {
        return {
            session: sanitizeSession(session),
            pendingCapture: pendingSnapshot(session),
            cleared: true,
        };
    }
    if (key && currentKey && key !== currentKey) {
        throw new ApiError(409, 'Capture request idempotency key mismatch');
    }
    if (currentStatus === 'none' || currentStatus === 'consumed') {
        session.pendingCaptureStatus = 'none';
        session.pendingCaptureAckedAt = null;
        await session.save();
        return {
            session: sanitizeSession(session),
            pendingCapture: pendingSnapshot(session),
            cleared: true,
            idempotentReplay: true,
        };
    }

    session.pendingCaptureStatus = 'consumed';
    await session.save();

    // Clear to none after consume (retain key for idempotent replay)
    session.pendingCaptureStatus = 'none';
    session.pendingCaptureAckedAt = null;
    await session.save();

    return {
        session: sanitizeSession(session),
        pendingCapture: pendingSnapshot(session),
        cleared: true,
    };
}

export async function getPendingCaptureRequest({ companyId, sessionId }) {
    requireObjectId(sessionId, 'Assisted capture session');
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId }).lean();
    if (!session) throw new ApiError(404, 'Assisted capture session not found');

    const sessionStatus = session.status || '';
    const status = session.pendingCaptureStatus || 'none';
    const navStatus = session.pendingNavigationStatus || 'none';
    const sessionActive = !['completed', 'cancelled', 'expired', 'failed'].includes(sessionStatus);

    const pendingNavigation = {
        pending: navStatus === 'pending',
        status: navStatus,
        targetUrl: session.pendingNavigationTargetUrl || '',
        googlePageIndex: Number(session.googlePageIndex || 1),
        requestedAt: session.pendingNavigationRequestedAt || null,
    };

    if (status !== 'pending') {
        return {
            pending: false,
            pendingCapture: pendingSnapshot(session),
            pendingNavigation,
            sessionStatus,
            sessionActive,
        };
    }

    return {
        pending: true,
        pendingCapture: pendingSnapshot(session),
        pendingNavigation,
        idempotencyKey: session.pendingCaptureIdempotencyKey || '',
        sessionStatus,
        sessionActive,
    };
}
