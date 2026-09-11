/**
 * Simple Lead Search ownership — company + createdBy.
 * Admin may monitor any company run without taking ownership.
 * Discovery Agent internals stay company-scoped (not this HTTP helper).
 */
import mongoose from 'mongoose';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { SearchCampaign } from '../../../../models/searchCampaign.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { checkUserPermission } from '../../../../utils/permissionUtils.js';

export const DE_DELETE_RUN_DATA_PERM = 'data_extractor.extractor.delete_run_data';

const LIVE_SESSION_STATUSES = [
    'created', 'queued', 'agent_assigned', 'opening', 'awaiting_user',
    'manual_action_required', 'ready_to_capture', 'capturing',
];
const LIVE_AUTO = ['running', 'paused_batch', 'paused_owner', 'paused_manual'];
const PAUSED_AUTO = ['paused_batch', 'paused_owner', 'paused_manual'];
const LIVE_PROCESSING = ['running'];

export function actorUserId(user) {
    return user?._id || user?.id || null;
}

export function actorUserName(user) {
    return String(user?.name || user?.fullName || user?.username || '').trim();
}

export function isDataExtractorAdmin(user) {
    const role = String(user?.roleName || user?.role?.name || user?.role || '').trim().toLowerCase();
    if (['superadmin', 'admin', 'system admin', 'systemadmin'].includes(role)) return true;
    return checkUserPermission(user, 'admin');
}

export function isRunOwner(user, session) {
    const uid = actorUserId(user);
    if (!uid || !session?.createdBy) return false;
    return String(session.createdBy) === String(uid);
}

export function isLiveExtractionSession(session) {
    if (!session) return false;
    if (session.dataRetentionStatus === 'DATA_DELETED') return false;
    if (['cancelled', 'completed', 'failed', 'expired'].includes(session.status)) return false;
    if (session.autoCollection?.ownerStoppedAt || session.autoCollection?.stopRequested) return false;
    const ac = session.autoCollection?.status || '';
    const ap = session.autoProcessing?.status || '';
    if (LIVE_AUTO.includes(ac) || LIVE_PROCESSING.includes(ap)) return true;
    if (LIVE_SESSION_STATUSES.includes(session.status)) return true;
    return false;
}

/** Paused / resumable — may be deleted after finalize. Not actively collecting. */
export function isPausedExtractionSession(session) {
    if (!session) return false;
    if (session.dataRetentionStatus === 'DATA_DELETED') return false;
    if (['cancelled', 'completed', 'failed', 'expired'].includes(session.status)) return false;
    if (session.autoCollection?.ownerStoppedAt || session.autoCollection?.stopRequested) return false;
    const ac = session.autoCollection?.status || '';
    const ap = session.autoProcessing?.status || '';
    if (LIVE_PROCESSING.includes(ap)) return false;
    return PAUSED_AUTO.includes(ac);
}

/** Genuinely running / processing / retrying / agent collecting. Delete is blocked. */
export function isActivelyCollectingSession(session) {
    if (!session) return false;
    if (session.dataRetentionStatus === 'DATA_DELETED') return false;
    if (['cancelled', 'completed', 'failed', 'expired'].includes(session.status)) return false;
    if (session.autoCollection?.ownerStoppedAt || session.autoCollection?.stopRequested) return false;
    if (isPausedExtractionSession(session)) return false;
    const ac = session.autoCollection?.status || '';
    const ap = session.autoProcessing?.status || '';
    if (ac === 'running' || LIVE_PROCESSING.includes(ap)) return true;
    if (LIVE_SESSION_STATUSES.includes(session.status) && !PAUSED_AUTO.includes(ac)) return true;
    return false;
}

export function ownerMongoFilter(user, { scope } = {}) {
    if (isDataExtractorAdmin(user) && String(scope || '').toLowerCase() === 'all') {
        return {};
    }
    const uid = actorUserId(user);
    if (!uid) throw new ApiError(403, 'Permission denied: user context required');
    return { createdBy: uid };
}

export function assertCanAccessOwnedRun(user, session) {
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    if (isDataExtractorAdmin(user)) {
        return {
            allowed: true,
            monitoring: !isRunOwner(user, session),
            ownerName: session.createdByName || '',
        };
    }
    if (isRunOwner(user, session)) {
        return { allowed: true, monitoring: false, ownerName: session.createdByName || actorUserName(user) };
    }
    throw new ApiError(403, 'Permission denied: this extraction belongs to another user');
}

export function assertCanDeleteRunData(user, session) {
    assertCanAccessOwnedRun(user, session);
    if (isActivelyCollectingSession(session)) {
        throw new ApiError(409, 'Stop extraction before deleting data.');
    }
    if (isDataExtractorAdmin(user)) return true;
    if (isRunOwner(user, session)) return true;
    if (checkUserPermission(user, DE_DELETE_RUN_DATA_PERM) || checkUserPermission(user, 'data_extractor.extractor.delete')) {
        return true;
    }
    throw new ApiError(403, 'Permission denied: cannot delete another user\'s extraction');
}

export async function findOtherUserLiveRun({ companyId, user }) {
    const uid = actorUserId(user);
    if (!uid) return null;
    return AssistedCaptureSession.findOne({
        companyId,
        createdBy: { $ne: uid },
        dataRetentionStatus: { $ne: 'DATA_DELETED' },
        $or: [
            { status: { $in: LIVE_SESSION_STATUSES } },
            { 'autoCollection.status': { $in: LIVE_AUTO } },
            { 'autoProcessing.status': { $in: LIVE_PROCESSING } },
        ],
    }).sort({ updatedAt: -1 }).lean();
}

export async function assertSimpleLeadSearchSessionAccess(req, res, next) {
    try {
        const sessionId = req.params?.sessionId;
        if (!sessionId) return next();
        if (!req.companyId) throw new ApiError(400, 'Company context required');
        if (!mongoose.isValidObjectId(sessionId)) throw new ApiError(400, 'Invalid session id');
        const session = await AssistedCaptureSession.findOne({
            _id: sessionId,
            companyId: req.companyId,
        }).select('createdBy createdByName status autoCollection.status autoProcessing.status autoCollection.ownerStoppedAt campaignId companyId dataRetentionStatus').lean();
        if (!session) throw new ApiError(404, 'Assisted capture session not found');
        const access = assertCanAccessOwnedRun(req.user, session);
        req.simpleLeadSearchSession = session;
        req.simpleLeadSearchMonitoring = Boolean(access.monitoring);
        next();
    } catch (err) {
        next(err);
    }
}

export async function assertSimpleLeadSearchCampaignAccess(req, res, next) {
    try {
        const campaignId = req.params?.campaignId;
        if (!campaignId) return next();
        if (!req.companyId) throw new ApiError(400, 'Company context required');
        if (!mongoose.isValidObjectId(campaignId)) throw new ApiError(400, 'Invalid campaign id');
        const campaign = await SearchCampaign.findOne({
            _id: campaignId,
            companyId: req.companyId,
        }).select('createdBy createdByName companyId status s3Archive').lean();
        if (!campaign) throw new ApiError(404, 'Search campaign not found');
        if (!isDataExtractorAdmin(req.user) && String(campaign.createdBy || '') !== String(actorUserId(req.user) || '')) {
            throw new ApiError(403, 'Permission denied: this campaign belongs to another user');
        }
        req.simpleLeadSearchCampaign = campaign;
        next();
    } catch (err) {
        next(err);
    }
}
