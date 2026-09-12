/**
 * List active / recent Simple Lead Search runs (AssistedCaptureSession).
 * No new Mongo collection — reads assisted_capture_sessions + SearchCampaign.
 */
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { SearchCampaign } from '../../../../models/searchCampaign.model.js';
import { SearchQuery } from '../../../../models/searchQuery.model.js';
import { User } from '../../../../models/user.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { ownerMongoFilter } from './simpleLeadSearch.ownership.util.js';

function requireCompanyId(companyId) {
    if (!companyId) throw new ApiError(400, 'Company context required');
    return companyId;
}

function runStatus(session) {
    const ac = session.autoCollection?.status || 'idle';
    const ap = session.autoProcessing?.status || 'idle';
    if (session.autoCollection?.ownerStoppedAt || session.autoCollection?.stopRequested || session.status === 'cancelled') {
        return 'CANCELLED';
    }
    if (ac === 'running' || ap === 'running') return 'RUNNING';
    if (String(ac).startsWith('paused') || ap === 'paused_owner') return 'PAUSED';
    if (ac === 'failed' || ap === 'failed' || session.status === 'failed') return 'FAILED';
    if (ac === 'stopped' || ap === 'stopped' || session.status === 'cancelled') return 'CANCELLED';
    if (ac === 'completed' || ap === 'completed' || session.status === 'completed') return 'COMPLETED';
    if (['queued', 'opening', 'awaiting_user', 'ready_to_capture', 'capturing', 'agent_assigned'].includes(session.status)) {
        return 'RUNNING';
    }
    return String(session.status || 'OPEN').toUpperCase();
}

function mapRun(session, campaign, query) {
    const ac = session.autoCollection || {};
    const ap = session.autoProcessing || {};
    const counts = ap.counts || {};
    return {
        runId: String(session._id),
        sessionId: String(session._id),
        campaignId: session.campaignId ? String(session.campaignId) : null,
        status: runStatus(session),
        sessionStatus: session.status,
        autoCollectionStatus: ac.status || 'idle',
        autoProcessingStatus: ap.status || 'idle',
        product: campaign?.targetIndustry || campaign?.name || '',
        campaignName: campaign?.name || '',
        city: campaign?.city || '',
        state: campaign?.state || '',
        country: campaign?.country || '',
        queryText: query?.queryText || query?.queryNormalized || '',
        startedAt: ac.startedAt || session.createdAt || null,
        updatedAt: session.updatedAt || null,
        completedAt: session.completedAt || ac.stoppedAt || ap.stoppedAt || null,
        progress: {
            pagesProcessed: ac.summary?.pagesProcessed ?? ac.pagesProcessedTotal ?? 0,
            queriesProcessed: ac.summary?.queriesProcessed ?? ac.queriesProcessedTotal ?? 0,
            phase: ac.phase || 'none',
            stage: ap.currentStage || 'idle',
        },
        resultCount: Number(
            session.originalRecordCount
            || ac.summary?.finalCampaignUnique
            || ac.rawRecordsCaptured
            || session.insertedCount
            || 0,
        ),
        verifiedCount: Number(counts.verified || 0),
        exportArtifacts: session.exportArtifacts || null,
        exportStatus: session.exportArtifacts?.xlsx?.key || session.exportArtifacts?.xlsx?.url ? 'EXPORTED' : 'NONE',
        archiveStatus: campaign?.s3Archive?.status || 'NOT_ARCHIVED',
        dataRetentionStatus: session.dataRetentionStatus || '',
        originalRecordCount: session.originalRecordCount ?? null,
        dataDeletedAt: session.dataDeletedAt || null,
        dataDeletedByName: session.dataDeletedByName || '',
        createdBy: session.createdBy ? String(session.createdBy) : null,
        createdByName: session.createdByName || '',
        ownerName: session.createdByName || '',
        assignedDeviceId: session.assignedDeviceId || '',
        assignedDeviceName: session.assignedDeviceName || '',
        agentStatus: session.assignedDeviceName
            ? (['queued', 'agent_assigned', 'opening', 'capturing', 'awaiting_user', 'ready_to_capture'].includes(session.status)
                ? 'Bound'
                : 'Assigned')
            : '',
        failureReason: session.safeFailureMessage || ac.lastErrorMessage || ap.lastErrorMessage || '',
    };
}

export function parseIncludeDeleted(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
}

/** Default history excludes tombstones. includeDeleted=true keeps them for audit review. */
export function recentRunsMongoFilter({ companyId, ownerFilter = {}, includeDeleted = false } = {}) {
    const filter = { companyId, ...ownerFilter };
    if (!parseIncludeDeleted(includeDeleted)) {
        filter.dataRetentionStatus = { $ne: 'DATA_DELETED' };
    }
    return filter;
}

export function filterRecentMappedRuns(mapped, activeRuns, { includeDeleted = false, limit = 30 } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
    return (mapped || []).filter((r) => {
        if (activeRuns.some((a) => a.runId === r.runId)) return false;
        if (!parseIncludeDeleted(includeDeleted) && r.dataRetentionStatus === 'DATA_DELETED') return false;
        return true;
    }).slice(0, lim);
}

export async function listSimpleLeadSearchRuns({ companyId, user, limit = 30, scope = 'mine', includeDeleted = false }) {
    const cid = requireCompanyId(companyId);
    const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const ownerFilter = ownerMongoFilter(user, { scope });
    const showDeleted = parseIncludeDeleted(includeDeleted);

    const activeFilter = {
        companyId: cid,
        ...ownerFilter,
        dataRetentionStatus: { $ne: 'DATA_DELETED' },
        status: { $nin: ['cancelled', 'completed', 'expired', 'failed'] },
        'autoCollection.stopRequested': { $ne: true },
        $and: [
            {
                $or: [
                    { 'autoCollection.ownerStoppedAt': null },
                    { 'autoCollection.ownerStoppedAt': { $exists: false } },
                ],
            },
            {
                $or: [
                    { 'autoCollection.status': { $in: ['running', 'paused_owner', 'paused_manual', 'paused_batch'] } },
                    { 'autoProcessing.status': 'running' },
                    {
                        status: {
                            $in: [
                                'queued', 'agent_assigned', 'opening', 'awaiting_user',
                                'ready_to_capture', 'capturing', 'manual_action_required',
                            ],
                        },
                    },
                ],
            },
        ],
    };

    const [active, recent] = await Promise.all([
        AssistedCaptureSession.find(activeFilter).sort({ updatedAt: -1 }).limit(lim).lean(),
        AssistedCaptureSession.find(recentRunsMongoFilter({
            companyId: cid,
            ownerFilter,
            includeDeleted: showDeleted,
        }))
            .sort({ updatedAt: -1 })
            .limit(lim)
            .lean(),
    ]);

    const all = [...active, ...recent];
    const seen = new Set();
    const sessions = [];
    for (const s of all) {
        const id = String(s._id);
        if (seen.has(id)) continue;
        seen.add(id);
        sessions.push(s);
    }

    const campaignIds = [...new Set(sessions.map((s) => String(s.campaignId || '')).filter(Boolean))];
    const queryIds = [...new Set(sessions.map((s) => String(s.queryId || '')).filter(Boolean))];
    const [campaigns, queries] = await Promise.all([
        campaignIds.length
            ? SearchCampaign.find({ _id: { $in: campaignIds }, companyId: cid }).lean()
            : [],
        queryIds.length
            ? SearchQuery.find({ _id: { $in: queryIds }, companyId: cid }).lean()
            : [],
    ]);
    const campaignById = Object.fromEntries(campaigns.map((c) => [String(c._id), c]));
    const queryById = Object.fromEntries(queries.map((q) => [String(q._id), q]));

    const missingOwnerIds = [...new Set(sessions
        .filter((s) => !s.createdByName && s.createdBy)
        .map((s) => String(s.createdBy)))];
    let userById = {};
    if (missingOwnerIds.length) {
        try {
            const users = await User.find({ _id: { $in: missingOwnerIds } }).select('name username').lean();
            userById = Object.fromEntries(users.map((u) => [String(u._id), u]));
        } catch {
            userById = {};
        }
    }
    for (const s of sessions) {
        if (!s.createdByName && s.createdBy && userById[String(s.createdBy)]) {
            s.createdByName = userById[String(s.createdBy)].name || userById[String(s.createdBy)].username || '';
        }
    }

    const mapped = sessions.map((s) => mapRun(
        s,
        campaignById[String(s.campaignId)],
        queryById[String(s.queryId)],
    ));

    const activeRuns = mapped.filter((r) => r.dataRetentionStatus !== 'DATA_DELETED'
        && r.status !== 'CANCELLED'
        && r.status !== 'COMPLETED'
        && r.status !== 'FAILED'
        && (['RUNNING', 'PAUSED', 'QUEUED'].includes(r.status)
        || ['running', 'paused_owner', 'paused_manual', 'paused_batch'].includes(r.autoCollectionStatus)
        || r.autoProcessingStatus === 'running'));
    const recentRuns = filterRecentMappedRuns(mapped, activeRuns, { includeDeleted: showDeleted, limit: lim });

    return { active: activeRuns, recent: recentRuns };
}
