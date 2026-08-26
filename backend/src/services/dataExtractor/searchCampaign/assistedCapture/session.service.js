import crypto from 'crypto';
import mongoose from 'mongoose';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { SearchCampaign } from '../../../../models/searchCampaign.model.js';
import { SearchQuery } from '../../../../models/searchQuery.model.js';
import { DiscoveryAgentJob } from '../../../../models/discoveryAgentJob.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { checkUserPermission } from '../../../../utils/permissionUtils.js';
import {
    ASSISTED_IDEMPOTENCY_REUSED_CODE,
    CAMPAIGN_ELIGIBLE_FOR_ASSISTED_CAPTURE,
    QUERY_ELIGIBLE_FOR_ASSISTED_CAPTURE,
    SESSION_ALLOWED_TTL_MINUTES_DEFAULT,
    SESSION_ALLOWED_TTL_MINUTES_MAX,
} from './constants.js';
import { actorUserId, assertAssistedCaptureManage, assertAssistedCaptureStart, assertAssistedCaptureView } from './permissions.util.js';
import { validateAssistedSearchUrl, assistedSourceFromUrl } from './googleUrl.util.js';
import { issueSessionToken } from './sessionToken.util.js';
import { buildSearchUrl } from '../searchQuery/normalize.util.js';

const SOCIAL_SESSION_SOURCES = Object.freeze(['facebook', 'instagram', 'linkedin', 'x']);

function requireObjectId(id, label) {
    if (!id || !mongoose.isValidObjectId(id)) throw new ApiError(404, `${label} not found`);
}

function hashText(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function buildIdempotencyFingerprint({ campaignId, queryId, sourceHint, searchUrl, sessionTtlMinutes }) {
    return hashText(JSON.stringify({ campaignId: String(campaignId), queryId: String(queryId), sourceHint, searchUrl, sessionTtlMinutes }));
}

function resolveFinancialYear({ body, headers }) {
    const bodyFy = String(body?.financialYear || '').trim();
    if (bodyFy) return bodyFy;
    const hdrFy = String(headers?.['x-financial-year'] || headers?.['financialyear'] || '').trim();
    if (hdrFy) return hdrFy;
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}-${String(year + 1).slice(-2)}`;
}

function sanitizeSession(session) {
    const plain = session.toObject ? session.toObject() : { ...session };
    delete plain.tokenHash;
    return plain;
}

function throwIdempotencyReuse() {
    const err = new ApiError(409, 'Idempotency key was previously used for a different capture request');
    err.errorCode = ASSISTED_IDEMPOTENCY_REUSED_CODE;
    throw err;
}

export async function createAssistedCaptureSession({ companyId, user, campaignId, queryId, body, headers = {} }) {
    assertAssistedCaptureStart(user);
    requireObjectId(campaignId, 'Search campaign');
    requireObjectId(queryId, 'Search query');

    if (Object.prototype.hasOwnProperty.call(body || {}, 'searchUrl')) throw new ApiError(400, 'body.searchUrl is not allowed');
    if (Object.prototype.hasOwnProperty.call(body || {}, 'companyId')) throw new ApiError(400, 'body.companyId is not allowed');

    const campaign = await SearchCampaign.findOne({ _id: campaignId, companyId }).lean();
    if (!campaign) throw new ApiError(404, 'Search campaign not found');
    if (!CAMPAIGN_ELIGIBLE_FOR_ASSISTED_CAPTURE.includes(campaign.status)) {
        throw new ApiError(400, `Campaign is ${campaign.status} and cannot accept assisted capture`);
    }

    const query = await SearchQuery.findOne({ _id: queryId, campaignId, companyId }).lean();
    if (!query) throw new ApiError(404, 'Search query not found');
    if (!QUERY_ELIGIBLE_FOR_ASSISTED_CAPTURE.includes(query.status)) {
        throw new ApiError(400, `Cannot create assisted capture for query status: ${query.status}`);
    }

    const searchUrl = validateAssistedSearchUrl(
        query.searchUrl || buildSearchUrl(query.sourceHint || body?.sourceHint, query.queryText),
    );
    const inferredSource = assistedSourceFromUrl(searchUrl) || 'google';
    const sourceHint = ['google', 'web', 'official_website', 'baidu', '1688', 'sogou', 'so360', ...SOCIAL_SESSION_SOURCES].includes(body?.sourceHint)
        ? body.sourceHint
        : (query.sourceHint || inferredSource);
    const isSocialSource = SOCIAL_SESSION_SOURCES.includes(sourceHint)
        || SOCIAL_SESSION_SOURCES.includes(inferredSource);

    const requestedTtl = Number(body?.sessionTtlMinutes);
    const sessionTtlMinutes = Number.isFinite(requestedTtl)
        ? Math.min(SESSION_ALLOWED_TTL_MINUTES_MAX, Math.max(5, requestedTtl))
        : SESSION_ALLOWED_TTL_MINUTES_DEFAULT;

    const now = new Date();
    // Store only tokenHash in the session doc.
    // Plain token is stored temporarily in DiscoveryAgentJob metadata and delivered on `/claim`.
    const { plain: tokenPlain, hash: tokenHash, expiresAt: tokenExpiresAt } = issueSessionToken(now, sessionTtlMinutes);
    const sessionExpiresAt = new Date(now.getTime() + sessionTtlMinutes * 60 * 1000);
    const idempotencyKey = String(body?.idempotencyKey || '').trim();
    const requestFingerprint = buildIdempotencyFingerprint({
        campaignId,
        queryId,
        sourceHint,
        searchUrl,
        sessionTtlMinutes,
    });

    if (idempotencyKey) {
        const existing = await AssistedCaptureSession.findOne({ companyId, idempotencyKey });
        if (existing) {
            if (existing.requestFingerprint !== requestFingerprint) throwIdempotencyReuse();
            return { session: sanitizeSession(existing), idempotentReplay: true };
        }
    }

    const financialYear = resolveFinancialYear({ body, headers });
    const actorId = actorUserId(user);
    const searchUrlHash = hashText(searchUrl);

    // Free the Discovery Agent for Google/China searches. Facebook/Instagram public ingest
    // must not cancel an in-progress Simple Lead Search Processing session.
    const ACTIVE_RELEASE = [
        'created', 'queued', 'agent_assigned', 'opening', 'awaiting_user',
        'manual_action_required', 'ready_to_capture', 'capturing',
    ];
    if (!isSocialSource) {
        await AssistedCaptureSession.updateMany(
            {
                companyId,
                status: { $in: ACTIVE_RELEASE },
            },
            {
                $set: {
                    status: 'cancelled',
                    cancelledAt: now,
                    cancelledBy: actorId,
                    pendingCaptureStatus: 'none',
                    pendingCaptureAckedAt: null,
                    pendingNavigationStatus: 'none',
                    failMessage: '',
                    'autoCollection.status': 'stopped',
                    'autoCollection.phase': 'done',
                    'autoCollection.enabled': false,
                    'autoCollection.stoppedAt': now,
                    'autoCollection.summary.stopReason': 'superseded_by_new_search',
                },
            },
        );
    }

    let discoveryAgentJob = null;
    if (!isSocialSource) {
        discoveryAgentJob = await DiscoveryAgentJob.create({
            companyId,
            financialYear,
            createdBy: actorId,
            sourceMode: 'assisted_google_capture',
            status: 'WAITING_CONNECT',
            keyword: query.queryText || 'assisted_google_capture',
            metadata: {
                assistedCaptureSessionId: null,
                searchUrlHash,
                pendingSessionToken: tokenPlain,
            },
        });
    }

    const sessionSource = isSocialSource
        ? (SOCIAL_SESSION_SOURCES.includes(sourceHint) ? sourceHint : inferredSource)
        : (['baidu', '1688', 'sogou', 'so360'].includes(inferredSource) ? inferredSource : 'google');

    const session = await AssistedCaptureSession.create({
        companyId,
        campaignId,
        queryId,
        discoveryAgentJobId: discoveryAgentJob?._id || null,
        source: sessionSource,
        sourceHint,
        searchUrl,
        searchUrlHash,
        status: isSocialSource ? 'completed' : 'queued',
        completedAt: isSocialSource ? now : null,
        idempotencyKey,
        requestFingerprint,
        tokenHash,
        tokenExpiresAt,
        sessionExpiresAt,
        createdBy: actorId,
        updatedBy: actorId,
    });

    if (discoveryAgentJob) {
        await DiscoveryAgentJob.findByIdAndUpdate(discoveryAgentJob._id, {
            $set: { 'metadata.assistedCaptureSessionId': session._id },
        });
    }

    return { session: sanitizeSession(session), idempotentReplay: false };
}

export async function listAssistedCaptureSessions({ companyId, user, campaignId, queryId, query }) {
    assertAssistedCaptureView(user);
    requireObjectId(campaignId, 'Search campaign');
    requireObjectId(queryId, 'Search query');

    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
    const page = Math.max(1, Number(query?.page) || 1);
    const skip = (page - 1) * limit;

    const filter = { companyId, campaignId, queryId };
    if (query?.status) filter.status = String(query.status);

    const [items, total] = await Promise.all([
        AssistedCaptureSession.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        AssistedCaptureSession.countDocuments(filter),
    ]);

    return {
        items: items.map((s) => sanitizeSession(s)),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        },
    };
}

export async function getAssistedCaptureSession({ companyId, user, campaignId, queryId, sessionId }) {
    assertAssistedCaptureView(user);
    requireObjectId(campaignId, 'Search campaign');
    requireObjectId(queryId, 'Search query');
    requireObjectId(sessionId, 'Assisted capture session');

    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId, campaignId, queryId }).lean();
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    return sanitizeSession(session);
}

function assertAssistedCaptureStartOrManage(user) {
    if (
        checkUserPermission(user, 'data_extractor.assisted_capture.manage')
        || checkUserPermission(user, 'data_extractor.assisted_capture.start')
    ) {
        if (!checkUserPermission(user, 'data_extractor.assisted_capture.manage')) {
            assertAssistedCaptureStart(user);
        }
        return;
    }
    throw new ApiError(403, 'Permission denied: data_extractor.assisted_capture.manage or start required');
}

export async function cancelAssistedCaptureSession({ companyId, user, campaignId, queryId, sessionId }) {
    assertAssistedCaptureStartOrManage(user);
    const actorId = actorUserId(user);
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId, campaignId, queryId });
    if (!session) throw new ApiError(404, 'Assisted capture session not found');

    if (!['completed', 'cancelled', 'expired', 'failed'].includes(session.status)) {
        session.status = 'cancelled';
        session.cancelledAt = new Date();
        session.cancelledBy = actorId;
        session.updatedBy = actorId;
        // Clear pending capture so agent exits cleanly
        session.pendingCaptureStatus = 'none';
        session.pendingCaptureAckedAt = null;
        await session.save();
    }

    return sanitizeSession(session);
}

/**
 * Continue after owner resolves consent/CAPTCHA in the managed Google window.
 * Does NOT capture — owner must still click Capture Visible Results.
 */
export async function continueAfterManualAction({ companyId, user, campaignId, queryId, sessionId }) {
    assertAssistedCaptureStartOrManage(user);
    const actorId = actorUserId(user);
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId, campaignId, queryId });
    if (!session) throw new ApiError(404, 'Assisted capture session not found');

    if (['completed', 'cancelled', 'expired', 'failed'].includes(session.status)) {
        throw new ApiError(400, 'Session ended. Start a new search.');
    }
    if (session.status !== 'manual_action_required' && session.status !== 'awaiting_user') {
        // Allow continue only from manual pause (or already ready)
        if (!['ready_to_capture', 'opening', 'capturing'].includes(session.status)) {
            throw new ApiError(400, 'Session is not waiting for manual action');
        }
    }

    session.status = 'awaiting_user';
    session.manualActionMessage = '';
    session.updatedBy = actorId;
    session.lastHeartbeatAt = new Date();
    await session.save();
    return sanitizeSession(session);
}

export async function completeAssistedCaptureSessionByUser({ companyId, user, campaignId, queryId, sessionId }) {
    assertAssistedCaptureStartOrManage(user);
    const actorId = actorUserId(user);
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId, campaignId, queryId });
    if (!session) throw new ApiError(404, 'Assisted capture session not found');

    if (!['completed', 'cancelled', 'expired', 'failed'].includes(session.status)) {
        session.status = 'completed';
        session.completedAt = new Date();
        session.updatedBy = actorId;
        await session.save();
    }

    return sanitizeSession(session);
}
