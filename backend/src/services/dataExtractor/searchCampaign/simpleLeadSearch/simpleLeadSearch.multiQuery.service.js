/**
 * Simple Lead Search — multi-query / next Google page (owner-driven only).
 * Does not change RawCapture identity. Does not create Leads. No paid API.
 */
import mongoose from 'mongoose';
import crypto from 'crypto';
import { ApiError } from '../../../../utils/ApiError.js';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { SearchQuery } from '../../../../models/searchQuery.model.js';
import { SearchCampaign } from '../../../../models/searchCampaign.model.js';
import { assertAssistedCaptureStart, assertAssistedCaptureView } from '../assistedCapture/permissions.util.js';
import {
    createAssistedCaptureSession,
    cancelAssistedCaptureSession,
} from '../assistedCapture/session.service.js';
import { getAgentStatusForCompany, SESSION_UI_LABELS } from '../assistedCapture/agentPresence.service.js';
import {
    buildNextAssistedPageUrl,
    readGooglePageIndexFromUrl,
    validateAssistedSearchUrl,
} from '../assistedCapture/googleUrl.util.js';
import {
    SLS_QUERY_CAPTURE_STATUSES,
    SLS_QUERY_OPENABLE,
    SLS_QUERY_TERMINAL,
} from './slsQueryProgress.constants.js';
import { chinaSourceBucket, sourceHintFromPlatform } from './queryBuilder.util.js';

function hashText(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function requireCompanyId(companyId) {
    if (!companyId || !mongoose.isValidObjectId(companyId)) throw new ApiError(400, 'Company context required');
    return companyId;
}

function requireObjectId(id, label) {
    if (!id || !mongoose.isValidObjectId(id)) throw new ApiError(404, `${label} not found`);
}

function actorId(user) {
    return user?._id || user?.id || null;
}

function sanitizeSession(session) {
    if (!session) return null;
    const plain = session.toObject ? session.toObject() : { ...session };
    delete plain.tokenHash;
    return plain;
}

async function loadOwnedSession(companyId, sessionId) {
    requireObjectId(sessionId, 'Assisted capture session');
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId });
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    return session;
}
function assertNotOwnerStopped(session) {
    const ac = session?.autoCollection || {};
    if (
        ac.ownerStoppedAt
        || ac.stopRequested === true
        || String(ac.summary?.stopReason || '') === 'owner_stop'
        || session?.status === 'cancelled'
    ) {
        throw new ApiError(400, 'STOPPED BY USER. This search will not resume. Start a new search.');
    }
}

const ACTIVE_SESSION = new Set([
    'queued', 'agent_assigned', 'opening', 'awaiting_user',
    'manual_action_required', 'ready_to_capture', 'capturing', 'created',
]);

const READY_FOR_PAGE = new Set([
    'awaiting_user', 'ready_to_capture', 'manual_action_required',
]);

export async function refreshQueryCaptureStats({ companyId, campaignId, queryId }) {
    const sessions = await AssistedCaptureSession.find({
        companyId,
        campaignId,
        queryId,
    }).select('captureEventCount visibleResultCount insertedCount updatedExistingCount googlePageIndex lastCaptureAt').lean();

    const uniqueCount = await RawCapture.countDocuments({ companyId, campaignId, queryId });
    const lastSeen = await RawCapture.findOne({ companyId, campaignId, queryId })
        .sort({ lastSeenAt: -1 })
        .select('lastSeenAt')
        .lean();

    const patch = {
        slsCaptureEventCount: sessions.reduce((n, s) => n + Number(s.captureEventCount || 0), 0),
        slsVisibleResultCount: sessions.reduce((n, s) => Math.max(n, Number(s.visibleResultCount || 0)), 0),
        slsNewUniqueCount: uniqueCount,
        slsUpdatedExistingCount: sessions.reduce((n, s) => n + Number(s.updatedExistingCount || 0), 0),
        slsLastGooglePage: sessions.reduce((n, s) => Math.max(n, Number(s.googlePageIndex || 0)), 0),
        slsLastCapturedAt: lastSeen?.lastSeenAt || sessions.reduce((best, s) => {
            const t = s.lastCaptureAt ? new Date(s.lastCaptureAt).getTime() : 0;
            return t > (best ? new Date(best).getTime() : 0) ? s.lastCaptureAt : best;
        }, null),
    };

    await SearchQuery.updateOne({ _id: queryId, companyId, campaignId }, { $set: patch });
    return patch;
}

export async function buildCampaignProgress({ companyId, campaignId, session = null }) {
    const queries = await SearchQuery.find({
        companyId,
        campaignId,
        status: { $ne: 'archived' },
    }).sort({ priorityScore: -1, createdAt: 1 }).lean();

    // Ensure slsCaptureStatus default for older rows
    for (const q of queries) {
        if (!q.slsCaptureStatus) {
            await SearchQuery.updateOne({ _id: q._id }, { $set: { slsCaptureStatus: 'pending' } });
            q.slsCaptureStatus = 'pending';
        }
    }

    const campaignUnique = await RawCapture.countDocuments({ companyId, campaignId });
    const campaignCaptures = await RawCapture.find({ companyId, campaignId })
        .select('seenCount source notes')
        .lean();
    const appearanceSum = campaignCaptures.reduce((n, c) => n + Number(c.seenCount || 1), 0);
    const emptySourceCounts = () => ({
        google: 0, baidu: 0, '1688': 0, sogou: 0, so360: 0,
        alibaba: 0, made_in_china: 0, global_sources: 0,
    });
    const rawBySource = emptySourceCounts();
    let verifiedManufacturers = 0;
    for (const c of campaignCaptures) {
        const bucket = chinaSourceBucket(c.source);
        if (rawBySource[bucket] != null) rawBySource[bucket] += 1;
        else rawBySource.google += 1;
        if (/"vs"\s*:\s*"VERIFIED_MANUFACTURER"/.test(String(c.notes || ''))) verifiedManufacturers += 1;
    }

    const sessions = await AssistedCaptureSession.find({ companyId, campaignId })
        .select('insertedCount updatedExistingCount acceptedCount visibleResultCount captureEventCount queryId source sourceHint')
        .lean();

    const resultAppearances = sessions.reduce((n, s) => n + Number(s.acceptedCount || 0), 0);
    const queryPlatformById = {};
    for (const q of queries) {
        queryPlatformById[String(q._id)] = q.selectedCriteria?.sourcePlatform || q.sourceHint || '';
    }
    const capturedBySource = emptySourceCounts();
    for (const s of sessions) {
        const n = Number(s.acceptedCount || 0);
        const platform = queryPlatformById[String(s.queryId)] || s.source || s.sourceHint;
        const bucket = chinaSourceBucket(platform);
        if (capturedBySource[bucket] != null) capturedBySource[bucket] += n;
        else capturedBySource.google += n;
    }
    const capturedSum = Object.values(capturedBySource).reduce((n, v) => n + Number(v || 0), 0);
    if (capturedSum === 0) {
        Object.assign(capturedBySource, rawBySource);
    }
    const newUniqueInserted = sessions.reduce((n, s) => n + Number(s.insertedCount || 0), 0);
    const existingUpdated = sessions.reduce((n, s) => n + Number(s.updatedExistingCount || 0), 0);
    const overlapping = Math.max(0, resultAppearances - newUniqueInserted);

    let currentQueryIndex = 0;
    const currentQueryId = session?.queryId ? String(session.queryId) : '';
    const queryProgress = queries.map((q, idx) => {
        const id = String(q._id);
        if (id === currentQueryId) currentQueryIndex = idx + 1;
        return {
            id,
            queryText: q.queryText,
            status: q.status,
            slsCaptureStatus: q.slsCaptureStatus || 'pending',
            priorityScore: q.priorityScore,
            businessType: q.selectedCriteria?.businessType || '',
            locationLabel: q.selectedCriteria?.locationLabel || '',
            ownerDisplayLabel: q.selectedCriteria?.ownerDisplayLabel || '',
            locationScope: q.selectedCriteria?.locationScope || '',
            relatedKeyword: q.selectedCriteria?.relatedKeyword || '',
            queryLanguage: q.selectedCriteria?.queryLanguage || 'en',
            sourcePlatform: q.selectedCriteria?.sourcePlatform || q.sourceHint || 'google',
            captureEvents: Number(q.slsCaptureEventCount || 0),
            visibleResults: Number(q.slsVisibleResultCount || 0),
            newUniqueRecords: Number(q.slsNewUniqueCount || 0),
            existingRecordsUpdated: Number(q.slsUpdatedExistingCount || 0),
            lastPageCaptured: Number(q.slsLastGooglePage || 0),
            lastCapturedAt: q.slsLastCapturedAt || null,
            isCurrent: id === currentQueryId,
        };
    });

    if (!currentQueryIndex && queryProgress.length) {
        const openIdx = queryProgress.findIndex((q) => !SLS_QUERY_TERMINAL.includes(q.slsCaptureStatus));
        currentQueryIndex = openIdx >= 0 ? openIdx + 1 : queryProgress.length;
    }

    return {
        queryIndex: currentQueryIndex || 1,
        queryTotal: queryProgress.length,
        googlePage: Number(session?.googlePageIndex || readGooglePageIndexFromUrl(session?.searchUrl) || 1),
        uniqueResultsCollected: campaignUnique,
        resultAppearances,
        newUniqueCompaniesOrResults: campaignUnique,
        newUniqueInsertedThisCampaign: newUniqueInserted,
        existingResultsUpdated: existingUpdated,
        duplicateOrOverlappingResults: overlapping,
        totalCampaignUniqueRecords: campaignUnique,
        appearanceSumSeenCount: appearanceSum,
        currentBusinessType: queryProgress.find((q) => q.isCurrent)?.businessType || '',
        currentLocationLabel: queryProgress.find((q) => q.isCurrent)?.locationLabel || '',
        currentOwnerDisplayLabel: queryProgress.find((q) => q.isCurrent)?.ownerDisplayLabel || '',
        searchLabel: queryProgress.find((q) => q.isCurrent)?.ownerDisplayLabel
            || queryProgress.find((q) => q.ownerDisplayLabel)?.ownerDisplayLabel
            || '',
        queries: queryProgress,
        currentQueryId: currentQueryId || null,
        sourceStatus: buildChinaSourceStatus(queryProgress, session, capturedBySource),
        capturedBySource,
        verifiedManufacturers,
        note: 'Accepted/visible counts are result appearances, not unique companies. Indexed Alibaba / Made-in-China / Global Sources are Google-hosted site: searches, not native portal capture.',
    };
}

function mapQueryStatusToSourceStatus(sls, sessionStatus) {
    const st = String(sls || 'pending');
    const sess = String(sessionStatus || '');
    if (sess === 'manual_action_required') return 'Waiting for User';
    if (['opening', 'agent_assigned', 'queued'].includes(sess)) return 'Searching';
    if (['awaiting_user', 'ready_to_capture', 'capturing'].includes(sess)) return 'Running';
    if (st === 'completed') return 'Completed';
    if (st === 'failed') return 'Failed';
    if (st === 'skipped') return 'Not Available';
    if (st === 'partially_captured' || st === 'ready' || st === 'opening') return 'Running';
    if (st === 'pending') return 'Queued';
    return st;
}

function buildChinaSourceStatus(queryProgress, session, capturedBySource = {}) {
    const buckets = {
        '1688': [], baidu: [], sogou: [], so360: [],
        alibaba: [], made_in_china: [], global_sources: [], google: [],
    };
    for (const q of queryProgress) {
        const key = chinaSourceBucket(q.sourcePlatform);
        if (!buckets[key]) buckets.google.push(q);
        else buckets[key].push(q);
    }
    const currentId = session?.queryId ? String(session.queryId) : '';
    function rollup(list, label, capturedKey) {
        if (!list.length) {
            return {
                source: label,
                status: 'Not Available',
                queryCount: 0,
                captured: Number(capturedBySource[capturedKey] || 0),
            };
        }
        const current = list.find((q) => q.id === currentId);
        const allDone = list.every((q) => ['completed', 'skipped', 'failed'].includes(q.slsCaptureStatus));
        const anyFail = list.some((q) => q.slsCaptureStatus === 'failed');
        const anyRun = list.some((q) => ['opening', 'ready', 'partially_captured'].includes(q.slsCaptureStatus));
        let status = 'Queued';
        if (current) status = mapQueryStatusToSourceStatus(current.slsCaptureStatus, session?.status);
        else if (allDone && anyFail) status = 'Failed';
        else if (allDone) status = 'Completed';
        else if (anyRun) status = 'Running';
        if (session?.status === 'manual_action_required' && current) {
            status = label === '1688'
                ? 'Waiting for User — Complete 1688 verification'
                : 'Waiting for User';
        }
        return {
            source: label,
            status,
            queryCount: list.length,
            captured: Number(capturedBySource[capturedKey] || 0),
        };
    }
    return [
        rollup(buckets['1688'], '1688 Direct', '1688'),
        rollup(buckets.baidu, 'Baidu', 'baidu'),
        rollup(buckets.sogou, 'Sogou', 'sogou'),
        rollup(buckets.so360, '360 Search', 'so360'),
        rollup(buckets.alibaba, 'Alibaba (indexed)', 'alibaba'),
        rollup(buckets.made_in_china, 'Made-in-China (indexed)', 'made_in_china'),
        rollup(buckets.global_sources, 'Global Sources (indexed)', 'global_sources'),
        rollup(buckets.google, 'Google Web', 'google'),
    ];
}

export async function openNextGeneratedQuery({ companyId, user, sessionId, headers = {} }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const current = await loadOwnedSession(cid, sessionId);
    assertNotOwnerStopped(current);
    const campaignId = current.campaignId;

    const campaign = await SearchCampaign.findOne({ _id: campaignId, companyId: cid }).lean();
    if (!campaign) throw new ApiError(404, 'Campaign not found');

    await refreshQueryCaptureStats({ companyId: cid, campaignId, queryId: current.queryId });

    const currentQuery = await SearchQuery.findOne({ _id: current.queryId, companyId: cid, campaignId });
    if (currentQuery) {
        const hasCaptures = Number(currentQuery.slsNewUniqueCount || 0) > 0
            || Number(current.captureEventCount || 0) > 0;
        if (!SLS_QUERY_TERMINAL.includes(currentQuery.slsCaptureStatus)) {
            currentQuery.slsCaptureStatus = hasCaptures ? 'partially_captured' : 'pending';
            currentQuery.updatedBy = actorId(user);
            await currentQuery.save();
        }
    }

    const queries = await SearchQuery.find({
        companyId: cid,
        campaignId,
        status: { $in: ['approved', 'opened', 'captured'] },
    }).sort({ priorityScore: -1, createdAt: 1 }).lean();

    const next = queries.find((q) => {
        const st = q.slsCaptureStatus || 'pending';
        return SLS_QUERY_OPENABLE.includes(st) && String(q._id) !== String(current.queryId);
    }) || queries.find((q) => {
        const st = q.slsCaptureStatus || 'pending';
        return st === 'partially_captured' && String(q._id) !== String(current.queryId);
    });

    if (!next) {
        throw new ApiError(400, 'No next pending generated query available. Mark queries complete/skip or stop and export.');
    }

    // End current browser session so agent can claim the new one (do not delete RawCaptures)
    if (ACTIVE_SESSION.has(current.status)) {
        try {
            await cancelAssistedCaptureSession({
                companyId: cid,
                user,
                campaignId,
                queryId: current.queryId,
                sessionId: current._id,
            });
        } catch (err) {
            // If already ended, continue
            if (Number(err?.statusCode) !== 404 && Number(err?.statusCode) !== 400) {
                // soft: still try to create next session
            }
        }
    }

    await SearchQuery.updateOne(
        { _id: next._id, companyId: cid },
        { $set: { slsCaptureStatus: 'opening', updatedBy: actorId(user) } },
    );

    const sessionResult = await createAssistedCaptureSession({
        companyId: cid,
        user,
        campaignId,
        queryId: next._id,
        body: {
            idempotencyKey: `sls-nextq-${cid}-${next._id}-${Date.now()}`.slice(0, 200),
            sourceHint: sourceHintFromPlatform(next.sourceHint || next.selectedCriteria?.sourcePlatform || 'google'),
            sessionTtlMinutes: 120,
            assignedAgentTokenId: current.assignedAgentTokenId || undefined,
            assignedAgentId: current.assignedAgentId || undefined,
            assignedDeviceId: current.assignedDeviceId || undefined,
            assignedDeviceName: current.assignedDeviceName || undefined,
        },
        headers,
    });

    // Ensure page index starts at 1 for new query
    await AssistedCaptureSession.updateOne(
        { _id: sessionResult.session._id },
        { $set: { googlePageIndex: 1 } },
    );

    const session = await AssistedCaptureSession.findById(sessionResult.session._id).lean();
    const agentStatus = await getAgentStatusForCompany(cid, { sessionId: session._id, user });
    const campaignProgress = await buildCampaignProgress({ companyId: cid, campaignId, session });

    return {
        session: sanitizeSession(session),
        previousSessionId: String(sessionId),
        selectedQuery: {
            id: String(next._id),
            queryText: next.queryText,
            slsCaptureStatus: 'opening',
        },
        campaign,
        campaignProgress,
        agentStatus,
        sessionUiLabel: SESSION_UI_LABELS[session.status] || session.status,
        message: 'Opening next generated query in managed Google window. Wait for Google Ready, then Capture Visible Results.',
        preserved: { rawCaptures: true, campaign: true, previousQueryResults: true },
    };
}

export async function openNextGooglePage({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const session = await loadOwnedSession(cid, sessionId);
    assertNotOwnerStopped(session);

    if (!READY_FOR_PAGE.has(session.status)) {
        throw new ApiError(400, `Open Next Google Page requires Google Ready (current: ${session.status})`);
    }
    if (['pending', 'acked'].includes(session.pendingCaptureStatus)) {
        throw new ApiError(400, 'Finish or wait for the pending Capture request before navigating');
    }
    if (['pending', 'acked'].includes(session.pendingNavigationStatus)) {
        return {
            session: sanitizeSession(session.toObject()),
            alreadyPending: true,
            message: 'Next Google page navigation already requested',
            campaignProgress: await buildCampaignProgress({
                companyId: cid,
                campaignId: session.campaignId,
                session: session.toObject(),
            }),
        };
    }

    const currentPage = Number(session.googlePageIndex || readGooglePageIndexFromUrl(session.searchUrl) || 1);
    const { url, nextPageIndex } = buildNextAssistedPageUrl(session.searchUrl, currentPage);

    session.pendingNavigationStatus = 'pending';
    session.pendingNavigationTargetUrl = url;
    session.pendingNavigationRequestedAt = new Date();
    session.pendingNavigationRequestedBy = actorId(user);
    session.pendingNavigationAckedAt = null;
    session.updatedBy = actorId(user);
    await session.save();

    const lean = await AssistedCaptureSession.findById(session._id).lean();
    return {
        session: sanitizeSession(lean),
        nextPageIndex,
        targetUrlHost: (() => { try { return new URL(url).host; } catch { return ''; } })(),
        message: 'Opening next Google results page. Wait for Google Ready, then click Capture Visible Results. CAPTCHA/consent stay manual.',
        campaignProgress: await buildCampaignProgress({
            companyId: cid,
            campaignId: session.campaignId,
            session: lean,
        }),
    };
}

export async function skipCurrentQuery({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const session = await loadOwnedSession(cid, sessionId);
    await refreshQueryCaptureStats({ companyId: cid, campaignId: session.campaignId, queryId: session.queryId });
    await SearchQuery.updateOne(
        { _id: session.queryId, companyId: cid },
        { $set: { slsCaptureStatus: 'skipped', updatedBy: actorId(user) } },
    );
    const campaignProgress = await buildCampaignProgress({
        companyId: cid,
        campaignId: session.campaignId,
        session: session.toObject(),
    });
    return {
        queryId: String(session.queryId),
        slsCaptureStatus: 'skipped',
        campaignProgress,
        message: 'Query marked skipped. Use Open Next Generated Query to continue, or Stop & Export.',
        session: sanitizeSession(session.toObject()),
    };
}

export async function markQueryComplete({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const session = await loadOwnedSession(cid, sessionId);
    await refreshQueryCaptureStats({ companyId: cid, campaignId: session.campaignId, queryId: session.queryId });
    await SearchQuery.updateOne(
        { _id: session.queryId, companyId: cid },
        { $set: { slsCaptureStatus: 'completed', updatedBy: actorId(user) } },
    );
    const campaignProgress = await buildCampaignProgress({
        companyId: cid,
        campaignId: session.campaignId,
        session: session.toObject(),
    });
    return {
        queryId: String(session.queryId),
        slsCaptureStatus: 'completed',
        campaignProgress,
        message: 'Query marked complete. Use Open Next Generated Query for more unique results, or Stop & Export.',
        session: sanitizeSession(session.toObject()),
    };
}

export async function getCampaignProgress({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureView(user);
    const session = await loadOwnedSession(cid, sessionId);
    await refreshQueryCaptureStats({ companyId: cid, campaignId: session.campaignId, queryId: session.queryId });
    // Mark ready when browser is ready
    if (['awaiting_user', 'ready_to_capture'].includes(session.status)) {
        await SearchQuery.updateOne(
            {
                _id: session.queryId,
                companyId: cid,
                slsCaptureStatus: { $in: ['opening', 'pending'] },
            },
            { $set: { slsCaptureStatus: 'ready' } },
        );
    }
    if (Number(session.captureEventCount || 0) > 0) {
        await SearchQuery.updateOne(
            {
                _id: session.queryId,
                companyId: cid,
                slsCaptureStatus: { $in: ['ready', 'opening', 'pending'] },
            },
            { $set: { slsCaptureStatus: 'partially_captured' } },
        );
    }
    const campaignProgress = await buildCampaignProgress({
        companyId: cid,
        campaignId: session.campaignId,
        session: session.toObject(),
    });
    return { campaignProgress, session: sanitizeSession(session.toObject()) };
}

/** Agent: ack pending navigation and bump google page index. */
export async function ackPendingNavigation({ companyId, sessionId, agentInstanceId }) {
    requireObjectId(sessionId, 'Assisted capture session');
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId });
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    if (session.pendingNavigationStatus !== 'pending') {
        return { session: session.toObject(), alreadyAcked: true };
    }
    const target = validateAssistedSearchUrl(session.pendingNavigationTargetUrl);
    const nextPage = readGooglePageIndexFromUrl(target);
    session.pendingNavigationStatus = 'acked';
    session.pendingNavigationAckedAt = new Date();
    session.searchUrl = target;
    session.searchUrlHash = hashText(target);
    session.googlePageIndex = nextPage;
    session.status = 'opening';
    await session.save();
    return {
        session: session.toObject(),
        targetUrl: target,
        googlePageIndex: nextPage,
        agentInstanceId,
    };
}

export async function completePendingNavigation({ companyId, sessionId }) {
    requireObjectId(sessionId, 'Assisted capture session');
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId });
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    if (['acked', 'pending'].includes(session.pendingNavigationStatus)) {
        session.pendingNavigationStatus = 'none';
        session.pendingNavigationAckedAt = null;
        if (!['manual_action_required', 'failed', 'completed', 'cancelled', 'expired'].includes(session.status)) {
            session.status = 'awaiting_user';
        }
        await session.save();
    }
    await SearchQuery.updateOne(
        { _id: session.queryId, companyId },
        {
            $set: {
                slsLastGooglePage: session.googlePageIndex || 1,
                slsCaptureStatus: Number(session.captureEventCount || 0) > 0 ? 'partially_captured' : 'ready',
            },
        },
    );
    return { session: session.toObject() };
}

export { SLS_QUERY_CAPTURE_STATUSES };