/**
 * Simple Lead Search — optional Auto Collection orchestrator.
 * Owner must click Start. Reuses capture / next-page / next-query / continue-after-manual.
 * Never bypasses CAPTCHA. Never creates CRM Leads.
 */
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { AssistedCaptureEvent } from '../../../../models/assistedCaptureEvent.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { assertAssistedCaptureStart, assertAssistedCaptureView } from '../assistedCapture/permissions.util.js';
import { requestCaptureVisibleResults } from '../assistedCapture/captureRequest.service.js';
import { getAgentStatusForCompany, SESSION_UI_LABELS } from '../assistedCapture/agentPresence.service.js';
import {
    openNextGeneratedQuery,
    openNextGooglePage,
    markQueryComplete,
    buildCampaignProgress,
    refreshQueryCaptureStats,
} from './simpleLeadSearch.multiQuery.service.js';
import { MAX_MODEL_CHINA_QUERIES } from './queryBuilder.util.js';

const ACTIVE_AUTO = ['running', 'paused', 'paused_owner', 'paused_manual', 'paused_batch'];
const READY = new Set(['awaiting_user', 'ready_to_capture']);
const ENDED = new Set(['completed', 'cancelled', 'expired', 'failed']);
const LIVE_SESSION = [
    'queued', 'agent_assigned', 'opening', 'awaiting_user',
    'ready_to_capture', 'capturing', 'manual_action_required',
];
export const CAPTURE_TARGET_OPTIONS = Object.freeze([25, 50, 100, 250, 500]);
const MANUAL_CAPTURE_TARGET_MAX = 500;
const DEFAULT_COLLECTION_MODE = 'unlimited';
/** Pages processed per worker cycle before persisting and auto-continuing (not a campaign total). */
const DEFAULT_WORKER_CYCLE_PAGES = 30;
export const UNSUPPORTED_PAGE_CODES = Object.freeze(['UNSUPPORTED_LAYOUT', 'NO_ORGANIC_RESULTS', 'NO_PARSER_RESULTS']);
export const HUMAN_PAGE_KINDS = Object.freeze(['consent', 'captcha', 'login']);
export const MAX_UNSUPPORTED_PAGE_RETRIES = 2;
export const DISCOVERY_STALL_MS = 120000;
/** Presence-check backoff while Discovery Agent is offline (seconds). */
export const AGENT_WAIT_BACKOFF_SEC = Object.freeze([5, 10, 20, 30]);
export const AGENT_OFFLINE_WAIT_MESSAGE = 'Discovery Agent temporarily offline — extraction will resume automatically when the agent reconnects.';
/** Laptop sleep / shutdown / agent closed — longer than stall (2m) and presence (45s). */
export const LONG_AGENT_OFFLINE_MS = 4 * 60 * 1000;
export const DISCOVERY_AGENT_OFFLINE = 'DISCOVERY_AGENT_OFFLINE';
export const OWNER_PAUSE = 'OWNER_PAUSE';
export const PAUSED_STATUS = 'paused';
export const AGENT_SLEEP_PAUSE_MESSAGE = 'Discovery Agent is offline. Your progress is saved. When the computer/agent is available again, click Resume Campaign to continue from the saved position.';
const GENUINE_COMPLETE_REASONS = new Set([
    'owner_stop',
    'capture_target_reached',
]);

export function parsePageKindFromMessage(message = '') {
    const m = String(message || '').match(/Page kind:\s*([a-z0-9_]+)/i);
    return m ? String(m[1]).toLowerCase() : '';
}

export function isPageOutcomeFail(sessionOrFields = {}) {
    const ac = sessionOrFields.autoCollection || {};
    const liveCode = String(sessionOrFields.failCode || '');
    const liveMsg = String(sessionOrFields.failMessage || '');
    const acCode = String(sessionOrFields.lastErrorCode || ac.lastErrorCode || '');
    const acMsg = String(sessionOrFields.lastErrorMessage || ac.lastErrorMessage || '');
    if (UNSUPPORTED_PAGE_CODES.includes(liveCode) || /Page kind:/i.test(liveMsg)) return true;
    if (acCode === 'agent_fail_ignored_after_accepted_ingest' && /Page kind:|unsupported_layout|no organic/i.test(acMsg)) {
        return true;
    }
    if (UNSUPPORTED_PAGE_CODES.includes(acCode) && /Page kind:/i.test(acMsg)) return true;
    return false;
}

function unsupportedPageKeyOf(session) {
    return `${session?.queryId || ''}:${Number(session?.googlePageIndex || 0)}`;
}

function requireCompanyId(companyId) {
    if (!companyId || !mongoose.isValidObjectId(companyId)) throw new ApiError(400, 'Company context required');
    return companyId;
}
function requireObjectId(id, label) {
    if (!id || !mongoose.isValidObjectId(id)) throw new ApiError(404, `${label} not found`);
}
function actorId(user) { return user?._id || user?.id || null; }
function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
}
function randomDelayMs(minSec, maxSec) {
    const lo = Math.min(minSec, maxSec);
    const hi = Math.max(minSec, maxSec);
    return Math.round((lo + Math.random() * (hi - lo)) * 1000);
}
function sanitizeSession(session) {
    if (!session) return null;
    const plain = session.toObject ? session.toObject() : { ...session };
    delete plain.tokenHash;
    return plain;
}
function defaultAuto() {
    return {
        enabled: false, status: 'idle', phase: 'none',
        collectionMode: DEFAULT_COLLECTION_MODE,
        pageCollectionMode: 'until_no_more',
        maxPagesPerQuery: 3, maxQueries: 24, delayMinSec: 20, delayMaxSec: 40,
        pagesPerBatch: 10, maxSafetyPagesPerQuery: DEFAULT_WORKER_CYCLE_PAGES, pauseAfterEachBatch: true,
        currentBatch: 1, pagesInCurrentBatch: 0, batchStartPage: 1,
        pagesInWorkerCycle: 0, workerCycleCount: 0,
        lastSuccessfullyCapturedPage: 0,
        resumeQueryId: null, resumeQueryIndex: 1, resumeMessage: '', batchMessage: '',
        stopAtUnique: 0, stopOnNoNewUniquePages: false,
        requestedCaptureTarget: 0,
        sourceResultsFound: 0, rawRecordsCaptured: 0, lastQueryIndex: 1,
        queriesCompleted: 0, totalApprovedQueries: 0,
        lastCursor: '', nextPageToken: '', lastDiscoveryAt: null, discoveryStatus: 'idle',
        pauseReason: '', requiresManualResume: false, stopRequested: false, ownerStoppedAt: null,
        autoEnrichAfter: false, autoQualifyAfterEnrich: false, autoVerifyAfterQualify: false,
        nextActionAt: null, tickLockUntil: null, agentWaitAttempt: 0, agentWaitStartedAt: null,
        pagesCapturedThisQuery: 0, pagesProcessedTotal: 0, queriesProcessedTotal: 0,
        consecutiveNoNewPages: 0, uniqueAtStart: 0, uniqueBeforeLastCapture: 0,
        lastPageVisible: 0, lastPageNewUnique: 0, lastPageUpdated: 0,
        captureEventsAtLastRequest: 0, insertedAtLastRequest: 0, updatedAtLastRequest: 0,
        summary: {
            pagesProcessed: 0, queriesProcessed: 0, totalAppearances: 0,
            newUniqueResults: 0, existingUpdated: 0, rejectedUnwanted: 0,
            finalCampaignUnique: 0, stopReason: '',
        },
        lastErrorCode: '', lastErrorMessage: '',
        unsupportedRetryCount: 0, unsupportedPageKey: '',
        lastPageAdvancementAt: null, lastNewResultAt: null, providerState: '',
        startedAt: null, stoppedAt: null, startedBy: null, stoppedBy: null,
        rootSessionId: null, campaignId: null,
    };
}
function normalizeCaptureTarget(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(MANUAL_CAPTURE_TARGET_MAX, Math.max(1, Math.round(n)));
}
function normalizeCollectionMode(body = {}) {
    const raw = String(body.collectionMode || body.captureMode || '').toLowerCase().trim();
    if (raw === 'unlimited' || raw === 'until_no_more' || raw === 'until_no_more_results') return 'unlimited';
    if (raw === 'fixed_target' || raw === 'fixed' || raw === 'target' || raw === 'manual' || raw === 'manual_limit') {
        return 'fixed_target';
    }
    // New campaigns / API bodies with missing mode are Unlimited.
    // Do not infer a hidden 100 (or any leftover target) as a cap.
    return DEFAULT_COLLECTION_MODE;
}
/** Resolve mode from persisted autoCollection (legacy sessions may only have a target). */
function resolveCollectionMode(ac = {}) {
    const raw = String(ac.collectionMode || '').toLowerCase().trim();
    if (raw === 'unlimited' || raw === 'fixed_target') return raw;
    if (Number(ac.requestedCaptureTarget || 0) > 0) return 'fixed_target';
    return DEFAULT_COLLECTION_MODE;
}
function readSettings(body = {}) {
    const delayMinSec = clampInt(body.delayMinSec ?? 20, 5, 120, 20);
    let delayMaxSec = clampInt(body.delayMaxSec ?? 40, 5, 180, 40);
    if (delayMaxSec < delayMinSec) delayMaxSec = delayMinSec;
    const collectionMode = normalizeCollectionMode(body);
    const modeRaw = String(body.pageCollectionMode || body.pageMode || 'until_no_more').toLowerCase();
    // Unlimited discovery always uses until_no_more pagination semantics
    const pageCollectionMode = collectionMode === 'unlimited'
        ? 'until_no_more'
        : (['fixed', 'batches', 'until_no_more'].includes(modeRaw) ? modeRaw : 'until_no_more');
    const pagesPerBatch = clampInt(body.pagesPerBatch, 1, 10, 10);
    const maxSafetyPagesPerQuery = clampInt(
        body.maxSafetyPagesPerQuery ?? body.workerCyclePages,
        10,
        50,
        DEFAULT_WORKER_CYCLE_PAGES,
    );
    const requestedCaptureTarget = collectionMode === 'fixed_target'
        ? normalizeCaptureTarget(body.requestedCaptureTarget ?? body.captureTarget ?? body.target)
        : 0;
    return {
        collectionMode: collectionMode === 'fixed_target' && requestedCaptureTarget > 0
            ? 'fixed_target'
            : DEFAULT_COLLECTION_MODE,
        pageCollectionMode,
        maxPagesPerQuery: clampInt(body.maxPagesPerQuery, 1, 10, 3),
        pagesPerBatch,
        maxSafetyPagesPerQuery,
        pauseAfterEachBatch: !(body.pauseAfterEachBatch === false || body.pauseAfterEachBatch === 'false' || body.pauseAfterEachBatch === 0),
        maxQueries: clampInt(body.maxQueries ?? body.maxGeneratedQueries, 1, MAX_MODEL_CHINA_QUERIES, 24),
        delayMinSec, delayMaxSec,
        // Unique-company rules must never terminate source discovery
        stopAtUnique: 0,
        stopOnNoNewUniquePages: false,
        requestedCaptureTarget,
        autoEnrichAfter: Boolean(body.autoEnrichAfter),
        autoQualifyAfterEnrich: Boolean(body.autoQualifyAfterEnrich),
        autoVerifyAfterQualify: Boolean(body.autoVerifyAfterQualify),
    };
}
async function campaignUnique(companyId, campaignId) {
    return RawCapture.countDocuments({ companyId, campaignId });
}
async function buildSummary(session) {
    const ac = session.autoCollection || {};
    const unique = await campaignUnique(session.companyId, session.campaignId);
    return {
        pagesProcessed: Number(ac.pagesProcessedTotal || 0),
        queriesProcessed: Number(ac.queriesProcessedTotal || 0),
        totalAppearances: Number(session.acceptedCount || 0),
        newUniqueResults: Math.max(0, unique - Number(ac.uniqueAtStart || 0)),
        existingUpdated: Number(session.updatedExistingCount || 0),
        rejectedUnwanted: Number(session.rejectedCount || 0),
        finalCampaignUnique: unique,
        stopReason: ac.summary?.stopReason || '',
    };
}
function progressView(session, campaignProgress = null) {
    const ac = session.autoCollection || defaultAuto();
    const now = Date.now();
    const nextAt = ac.nextActionAt ? new Date(ac.nextActionAt).getTime() : 0;
    const secondsUntilNext = nextAt > now ? Math.ceil((nextAt - now) / 1000) : 0;
    const labelMap = {
        running: 'Auto Collection Running',
        paused_manual: 'Manual action required in the Google window.',
        paused: 'Auto Collection Paused',
        paused_owner: 'Auto Collection Paused',
        paused_batch: 'Batch completed — waiting for owner to continue',
        completed: 'Auto Collection Completed',
        stopped: 'Auto Collection Stopped',
        failed: 'Auto Collection Failed',
        idle: 'Auto Collection Idle',
        waiting_for_agent: AGENT_OFFLINE_WAIT_MESSAGE,
    };
    const waitingAgent = ac.pauseReason === 'agent_offline'
        || ac.discoveryStatus === 'waiting_for_agent';
    return {
        enabled: Boolean(ac.enabled),
        status: ac.status || 'idle',
        phase: ac.phase || 'none',
        settings: {
            collectionMode: resolveCollectionMode(ac),
            pageCollectionMode: ac.pageCollectionMode || 'fixed',
            maxPagesPerQuery: ac.maxPagesPerQuery, maxQueries: ac.maxQueries,
            pagesPerBatch: ac.pagesPerBatch || 10,
            maxSafetyPagesPerQuery: ac.maxSafetyPagesPerQuery || DEFAULT_WORKER_CYCLE_PAGES,
            workerCyclePages: ac.maxSafetyPagesPerQuery || DEFAULT_WORKER_CYCLE_PAGES,
            pauseAfterEachBatch: ac.pauseAfterEachBatch !== false,
            delayMinSec: ac.delayMinSec, delayMaxSec: ac.delayMaxSec,
            stopAtUnique: 0, stopOnNoNewUniquePages: false,
            requestedCaptureTarget: Number(ac.requestedCaptureTarget || 0) || null,
            autoEnrichAfter: ac.autoEnrichAfter, autoQualifyAfterEnrich: ac.autoQualifyAfterEnrich,
            autoVerifyAfterQualify: ac.autoVerifyAfterQualify,
        },
        collectionMode: resolveCollectionMode(ac),
        pageCollectionMode: ac.pageCollectionMode || 'fixed',
        requestedCaptureTarget: resolveCollectionMode(ac) === 'fixed_target'
            ? Number(ac.requestedCaptureTarget || 0)
            : null,
        sourceResultsFound: Number(ac.sourceResultsFound || session.visibleResultCount || 0),
        rawRecordsCaptured: Number(ac.rawRecordsCaptured || session.acceptedCount || 0),
        uniqueCompanies: Number(campaignProgress?.totalCampaignUniqueRecords
            ?? campaignProgress?.uniqueResultsCollected
            ?? ac.summary?.finalCampaignUnique
            ?? 0),
        discoveryStatus: ac.discoveryStatus || ac.status || 'idle',
        pauseReason: ac.pauseReason || '',
        ownerStoppedAt: ac.ownerStoppedAt || null,
        stopRequested: Boolean(ac.stopRequested),
        lastDiscoveryAt: ac.lastDiscoveryAt || session.lastCaptureAt || null,
        lastQueryIndex: Number(ac.lastQueryIndex || ac.resumeQueryIndex || campaignProgress?.queryIndex || 1),
        queriesCompleted: Number(ac.queriesCompleted || ac.queriesProcessedTotal || 0),
        totalApprovedQueries: Number(ac.totalApprovedQueries || campaignProgress?.queryTotal || ac.maxQueries || 0),
        lastCursor: ac.lastCursor || '',
        nextPageToken: ac.nextPageToken || '',
        pagesInWorkerCycle: Number(ac.pagesInWorkerCycle || 0),
        workerCycleCount: Number(ac.workerCycleCount || 0),
        currentBatch: Number(ac.currentBatch || 1),
        pagesInCurrentBatch: Number(ac.pagesInCurrentBatch || 0),
        pagesPerBatch: Number(ac.pagesPerBatch || 10),
        maxSafetyPagesPerQuery: Number(ac.maxSafetyPagesPerQuery || DEFAULT_WORKER_CYCLE_PAGES),
        lastSuccessfullyCapturedPage: Number(ac.lastSuccessfullyCapturedPage || 0),
        batchMessage: ac.batchMessage || '',
        resumeMessage: ac.resumeMessage || '',
        canContinueBatch: ac.status === 'paused_batch',
        canResumeCheckpoint: (
            ['paused', 'paused_owner', 'paused_manual', 'paused_batch', 'stopped', 'failed', 'completed'].includes(ac.status)
            || ac.pauseReason === DISCOVERY_AGENT_OFFLINE
        ) && Number(ac.lastSuccessfullyCapturedPage || ac.lastQueryIndex || session.googlePageIndex || 0) > 0,
        queryIndex: campaignProgress?.queryIndex || 1,
        queryTotal: Number(campaignProgress?.queryTotal || ac.totalApprovedQueries || ac.maxQueries || 0),
        businessType: campaignProgress?.currentBusinessType || '',
        locationLabel: campaignProgress?.currentLocationLabel || '',
        searchLabel: campaignProgress?.searchLabel || '',
        ownerDisplayLabel: campaignProgress?.currentOwnerDisplayLabel || campaignProgress?.searchLabel || '',
        googlePage: Number(session.googlePageIndex || campaignProgress?.googlePage || 1),
        maxPagesPerQuery: ac.maxPagesPerQuery,
        pagesCapturedThisQuery: Number(ac.pagesCapturedThisQuery || 0),
        pagesProcessedTotal: Number(ac.pagesProcessedTotal || 0),
        queriesProcessedTotal: Number(ac.queriesProcessedTotal || 0),
        visibleThisPage: Number(ac.lastPageVisible || session.visibleResultCount || 0),
        newUniqueThisPage: Number(ac.lastPageNewUnique || 0),
        existingUpdatedThisPage: Number(ac.lastPageUpdated || 0),
        campaignUnique: campaignProgress?.totalCampaignUniqueRecords ?? campaignProgress?.uniqueResultsCollected ?? null,
        nextActionInSeconds: secondsUntilNext,
        nextActionAt: ac.nextActionAt || null,
        summary: ac.summary || {},
        lastErrorCode: ac.lastErrorCode || '',
        lastErrorMessage: ac.lastErrorMessage || '',
        lastAgentHeartbeat: session.lastHeartbeatAt || null,
        lastConfirmedGooglePage: Number(ac.lastSuccessfullyCapturedPage || 0),
        agentWaitAttempt: Number(ac.agentWaitAttempt || 0),
        lastNewResultAt: ac.lastNewResultAt || session.lastCaptureAt || ac.lastDiscoveryAt || null,
        lastPageAdvancementAt: ac.lastPageAdvancementAt || ac.lastDiscoveryAt || null,
        providerState: ac.providerState
            || (ac.status === 'paused_manual' || session.status === 'manual_action_required'
                ? 'Human Verification'
                : (ac.pauseReason === 'unsupported_page_retry'
                    ? 'Retry'
                    : (waitingAgent
                        ? 'Provider temporarily unavailable'
                        : (ac.status === 'running' ? 'Running' : '')))),
        pendingQueries: Math.max(0, Number(ac.totalApprovedQueries || campaignProgress?.queryTotal || 0)
            - Number(ac.lastQueryIndex || campaignProgress?.queryIndex || 1)),
        queryProgressLabel: `Query ${Number(ac.lastQueryIndex || campaignProgress?.queryIndex || 1)}/${Number(ac.totalApprovedQueries || campaignProgress?.queryTotal || 0) || '—'} — Page ${Number(session.googlePageIndex || campaignProgress?.googlePage || 1)}`,
        discoveryDisplayStatus: ac.pauseReason === DISCOVERY_AGENT_OFFLINE
            ? 'paused_agent_offline'
            : (waitingAgent
                ? 'waiting_for_agent'
                : (ac.providerState === 'Retry' || ac.pauseReason === 'unsupported_page_retry'
                    ? 'Waiting on provider / retrying'
                    : (ac.providerState === 'Human Verification' || ac.status === 'paused_manual'
                        ? 'Human verification required'
                        : (ac.discoveryStatus || ac.status || 'idle')))),
        manualActionRequired: session.status === 'manual_action_required' || ac.status === 'paused_manual',
        requiresManualResume: Boolean(ac.requiresManualResume)
            || ac.pauseReason === DISCOVERY_AGENT_OFFLINE
            || ac.pauseReason === OWNER_PAUSE
            || ac.pauseReason === 'owner_pause',
        uiLabel: ac.pauseReason === DISCOVERY_AGENT_OFFLINE
            ? AGENT_SLEEP_PAUSE_MESSAGE
            : (waitingAgent
                ? AGENT_OFFLINE_WAIT_MESSAGE
                : (ac.providerState === 'Retry' || ac.pauseReason === 'unsupported_page_retry'
                    ? 'Waiting on provider / retrying'
                    : (labelMap[ac.status] || 'Auto Collection Idle'))),
        captureTargetOptions: CAPTURE_TARGET_OPTIONS,
    };
}
async function loadOwnedSession(companyId, sessionId) {
    requireObjectId(sessionId, 'Assisted capture session');
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId });
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    return session;
}
export function isOwnerStopped(session) {
    const ac = session?.autoCollection || {};
    // Child source sessions are cancelled on Google→next-query handoff.
    // That is not an owner Stop — only explicit owner-stop flags are.
    return Boolean(ac.ownerStoppedAt)
        || ac.stopRequested === true
        || String(ac.summary?.stopReason || '') === 'owner_stop';
}
async function ownerStopAborted(session) {
    const latest = await AssistedCaptureSession.findById(session._id)
        .select('status autoCollection.ownerStoppedAt autoCollection.stopRequested autoCollection.status autoCollection.summary.stopReason')
        .lean();
    return !latest || isOwnerStopped(latest) || latest.autoCollection?.status !== 'running';
}
function ownerStopSet(now, user) {
    return {
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: actorId(user),
        updatedBy: actorId(user),
        pendingCaptureStatus: 'none',
        pendingCaptureAckedAt: null,
        pendingNavigationStatus: 'none',
        pendingNavigationTargetUrl: '',
        pendingNavigationAckedAt: null,
        'autoCollection.status': 'stopped',
        'autoCollection.phase': 'done',
        'autoCollection.enabled': false,
        'autoCollection.stopRequested': true,
        'autoCollection.ownerStoppedAt': now,
        'autoCollection.stoppedAt': now,
        'autoCollection.stoppedBy': actorId(user),
        'autoCollection.discoveryStatus': 'stopped',
        'autoCollection.pauseReason': '',
        'autoCollection.summary.stopReason': 'owner_stop',
        'autoCollection.nextActionAt': null,
        'autoCollection.tickLockUntil': null,
        'autoCollection.lastErrorCode': 'owner_stop',
        'autoCollection.lastErrorMessage': 'Stopped by user. Collected results are preserved.',
        'autoProcessing.status': 'stopped',
        'autoProcessing.enabled': false,
        'autoProcessing.ownerWorkflowEnabled': false,
        'autoProcessing.currentStage': 'done',
        'autoProcessing.flushRequested': false,
        'autoProcessing.autoResumeNotice': false,
        'autoProcessing.retryTemporaryFailures': false,
        'autoProcessing.stoppedAt': now,
        'autoProcessing.stoppedBy': actorId(user),
        'autoProcessing.lastErrorCode': 'owner_stop',
        'autoProcessing.lastErrorMessage': 'Stopped by owner. Completed work is preserved.',
    };
}
/**
 * Owner Stop: persist immediately, cancel Discovery Agent session, halt AC/AP,
 * stop sibling query sessions in the same campaign run. Never deletes captures.
 */
export async function ownerStopPersistentRun({ companyId, user, sessionId, reason = 'owner_stop' }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const session = await loadOwnedSession(cid, sessionId);
    if (isOwnerStopped(session) || session.status === 'cancelled') {
        const campaignProgress = await buildCampaignProgress({
            companyId: cid,
            campaignId: session.campaignId,
            session: session.toObject(),
        });
        return {
            session: sanitizeSession(session.toObject()),
            autoCollection: progressView(session.toObject(), campaignProgress),
            campaignProgress,
            sessionEnded: true,
            alreadyStopped: true,
            sessionEndedMessage: 'Search is already stopped.',
            message: 'Search is already stopped.',
            preserved: { rawCaptures: true, campaign: true, searchQuery: true, sessionHistory: true },
            reason: 'already_stopped',
        };
    }
    const now = new Date();
    const rootId = session.autoCollection?.rootSessionId || session._id;
    const campaignId = session.campaignId;
    const siblingFilter = {
        companyId: cid,
        $or: [
            { _id: session._id },
            {
                campaignId,
                $or: [
                    { _id: rootId },
                    { 'autoCollection.rootSessionId': rootId },
                    { 'autoCollection.rootSessionId': session._id },
                ],
                $or: [
                    { 'autoCollection.status': { $in: ACTIVE_AUTO } },
                    { 'autoProcessing.status': 'running' },
                    { 'autoProcessing.enabled': true },
                    { status: { $in: LIVE_SESSION } },
                ],
            },
        ],
    };
    const ids = await AssistedCaptureSession.find(siblingFilter).select('_id').lean();
    const idList = ids.map((d) => d._id);
    if (!idList.some((id) => String(id) === String(session._id))) idList.push(session._id);
    await AssistedCaptureSession.updateMany(
        { _id: { $in: idList }, companyId: cid },
        { $set: ownerStopSet(now, user) },
    );
    try {
        const { stopAutoProcessing } = await import('./simpleLeadSearch.autoProcessing.service.js');
        for (const id of idList) {
            try {
                await stopAutoProcessing({
                    companyId: cid,
                    user,
                    sessionId: String(id),
                    body: { stopJobs: true },
                });
            } catch { /* jobs may already be idle */ }
        }
    } catch { /* soft */ }
    const fresh = await AssistedCaptureSession.findById(session._id);
    const campaignProgress = await buildCampaignProgress({
        companyId: cid,
        campaignId: fresh.campaignId,
        session: fresh.toObject(),
    });
    return {
        session: sanitizeSession(fresh.toObject()),
        autoCollection: progressView(fresh.toObject(), campaignProgress),
        campaignProgress,
        sessionEnded: true,
        sessionEndedMessage: 'STOPPED BY USER. Collected results are preserved. Start a new search.',
        message: 'STOPPED BY USER. Collected results are preserved.',
        preserved: { rawCaptures: true, campaign: true, searchQuery: true, sessionHistory: true },
        reason,
    };
}
async function finalizeStop(session, { status, reason, user }) {
    if (status === 'completed' && !GENUINE_COMPLETE_REASONS.has(String(reason || ''))) {
        if (collectionHasUnfinishedWork(session)) {
            return pauseForLongAgentOffline(session, {
                message: AGENT_SLEEP_PAUSE_MESSAGE,
                fromInvalidComplete: true,
                rejectedReason: reason,
            });
        }
    }
    const summary = await buildSummary(session);
    summary.stopReason = reason;
    session.autoCollection = session.autoCollection || defaultAuto();
    session.autoCollection.status = status;
    session.autoCollection.phase = 'done';
    session.autoCollection.enabled = false;
    session.autoCollection.stoppedAt = new Date();
    session.autoCollection.stoppedBy = actorId(user);
    session.autoCollection.summary = summary;
    session.autoCollection.nextActionAt = null;
    session.autoCollection.tickLockUntil = null;
    const discoveryMap = {
        capture_target_reached: 'target_reached',
        google_no_more_pages: 'no_more_results',
        all_queries_exhausted: 'completed',
        collection_complete: 'completed',
        collection_complete_pipeline_active: 'completed',
        owner_stop: 'stopped',
        agent_offline: 'paused',
    };
    session.autoCollection.discoveryStatus = discoveryMap[reason]
        || (status === 'failed' ? 'failed' : status === 'stopped' ? 'stopped' : 'completed');
    if (status === 'failed') {
        const existing = String(session.autoCollection.lastErrorMessage || '').trim();
        if (!existing) {
            session.autoCollection.lastErrorCode = String(
                session.autoCollection.lastErrorCode || session.failCode || reason || 'failed',
            ).slice(0, 80);
            session.autoCollection.lastErrorMessage = String(
                session.failMessage || session.safeFailureMessage || reason || 'Discovery failed',
            ).replace(/[\r\n]+/g, ' ').slice(0, 500);
        }
    }
    if (reason === 'owner_stop') {
        session.autoCollection.ownerStoppedAt = new Date();
        session.autoCollection.pauseReason = '';
    }
    session.autoCollection.lastDiscoveryAt = new Date();
    await session.save();
    // Flush continuous CP6→CP7→CP8 pipeline for remaining records below batch size
    try {
        if (session.autoProcessing?.enabled && session.autoProcessing?.status === 'running') {
            const { onCaptureStoppedFlush } = await import('./simpleLeadSearch.autoProcessing.service.js');
            await onCaptureStoppedFlush({
                companyId: session.companyId,
                user,
                sessionId: String(session._id),
            });
        }
    } catch {
        /* soft — capture stop must not fail */
    }
    return session;
}
function scheduleDelay(session) {
    const ac = session.autoCollection;
    ac.phase = 'delay';
    ac.nextActionAt = new Date(Date.now() + randomDelayMs(ac.delayMinSec || 20, ac.delayMaxSec || 40));
}
export async function stopCompanyAutoCollection({ companyId, user, reason = 'new_search_started', createdBy = null }) {
    const cid = requireCompanyId(companyId);
    const now = new Date();
    const ownerId = createdBy || actorId(user);
    const res = await AssistedCaptureSession.updateMany(
        {
            companyId: cid,
            ...(ownerId ? { createdBy: ownerId } : {}),
            'autoCollection.status': { $in: ACTIVE_AUTO },
        },
        {
            $set: {
                'autoCollection.status': 'stopped',
                'autoCollection.phase': 'done',
                'autoCollection.enabled': false,
                'autoCollection.stoppedAt': now,
                'autoCollection.stoppedBy': actorId(user),
                'autoCollection.summary.stopReason': reason,
            },
        },
    );
    return { stoppedCount: res.modifiedCount || 0, reason };
}

async function acceptedSourceAppearances(session) {
    const fromAc = Number(session.autoCollection?.rawRecordsCaptured || 0);
    const fromSession = Number(session.acceptedCount || 0);
    if (fromAc > 0 || fromSession > 0) return Math.max(fromAc, fromSession);
    const agg = await AssistedCaptureEvent.aggregate([
        {
            $match: {
                sessionId: session._id,
                companyId: session.companyId,
                status: { $in: ['completed', 'partially_completed'] },
            },
        },
        { $group: { _id: null, accepted: { $sum: '$acceptedCount' }, visible: { $sum: '$visibleResultCount' } } },
    ]);
    return Number(agg[0]?.accepted || 0);
}

async function maybeFinishLimits(session, user) {
    const ac = session.autoCollection;
    const collectionMode = resolveCollectionMode(ac);
    const target = Number(ac.requestedCaptureTarget || 0);
    const rawAccepted = await acceptedSourceAppearances(session);
    ac.rawRecordsCaptured = rawAccepted;
    ac.sourceResultsFound = Math.max(Number(ac.sourceResultsFound || 0), Number(session.visibleResultCount || 0));
    ac.queriesCompleted = Number(ac.queriesProcessedTotal || 0);

    // Fixed-target only: stop on raw accepted appearances (never unique-company count)
    if (collectionMode === 'fixed_target' && target > 0 && rawAccepted >= target) {
        ac.discoveryStatus = 'target_reached';
        await finalizeStop(session, { status: 'completed', reason: 'capture_target_reached', user });
        return true;
    }
    // Unlimited / otherwise: never stop for unique plateau, unique target, or worker-cycle safety here.
    // Worker-cycle safety is handled in decide_next as auto-continue.
    return false;
}

/** Persist progress and schedule the next worker cycle — does NOT complete the campaign. */
function scheduleWorkerCycleContinue(session) {
    const ac = session.autoCollection;
    const page = Number(ac.lastSuccessfullyCapturedPage || session.googlePageIndex || 0);
    const qIndex = Number(ac.lastQueryIndex || ac.resumeQueryIndex || 1);
    ac.pagesInWorkerCycle = 0;
    ac.workerCycleCount = Number(ac.workerCycleCount || 0) + 1;
    ac.discoveryStatus = 'running';
    ac.pauseReason = '';
    ac.lastErrorCode = 'worker_cycle_continue';
    ac.lastErrorMessage = `Worker cycle ${ac.workerCycleCount} complete at query ${qIndex} page ${page}. Continuing automatically.`;
    ac.resumeQueryId = session.queryId;
    ac.resumeQueryIndex = qIndex;
    ac.resumeMessage = `Continuing Auto Collection from Query ${qIndex}, Page ${page || 1}`;
    ac.lastDiscoveryAt = new Date();
    ac.phase = 'await_cycle';
    ac.nextActionAt = new Date(Date.now() + randomDelayMs(ac.delayMinSec || 5, Math.max(ac.delayMinSec || 5, Math.min(ac.delayMaxSec || 20, 20))));
    ac.status = 'running';
    ac.enabled = true;
}

async function startPostCollectionJobs(session, user) {
    const ac = session.autoCollection;
    // Continuous automatic processing owns CP6→CP7→CP8 while enabled — skip end-of-run cascade
    if (session.autoProcessing?.enabled && ['running', 'paused_owner'].includes(session.autoProcessing?.status)) {
        try {
            const { onCaptureStoppedFlush } = await import('./simpleLeadSearch.autoProcessing.service.js');
            await onCaptureStoppedFlush({
                companyId: session.companyId,
                user,
                sessionId: String(session._id),
            });
        } catch { /* soft */ }
        await finalizeStop(session, { status: 'completed', reason: 'all_queries_exhausted', user });
        return;
    }
    if (!ac.autoEnrichAfter) {
        await finalizeStop(session, { status: 'completed', reason: 'all_queries_exhausted', user });
        return;
    }
    try {
        const { startEnrichmentJob } = await import('../rawCaptureEnrichment/rawCaptureEnrichment.service.js');
        await startEnrichmentJob({ companyId: session.companyId, user, sessionId: String(session._id), mode: 'all_unverified' });
    } catch (err) {
        ac.lastErrorCode = 'enrich_start_failed';
        ac.lastErrorMessage = String(err?.message || 'Enrichment start failed').slice(0, 500);
        await finalizeStop(session, { status: 'completed', reason: 'collection_complete_enrich_failed', user });
        return;
    }
    if (!ac.autoQualifyAfterEnrich) {
        await finalizeStop(session, { status: 'completed', reason: 'collection_complete_enrich_started', user });
        return;
    }
    try {
        const { startQualificationJob } = await import('../rawCaptureQualification/rawCaptureQualification.service.js');
        await startQualificationJob({ companyId: session.companyId, user, sessionId: String(session._id), mode: 'all_enriched' });
    } catch (err) {
        ac.lastErrorCode = 'qualify_start_failed';
        ac.lastErrorMessage = String(err?.message || 'Qualification start failed').slice(0, 500);
    }
    if (!ac.autoVerifyAfterQualify) {
        await finalizeStop(session, { status: 'completed', reason: 'collection_complete_enrich_qualify_started', user });
        return;
    }
    try {
        const { startVerificationJob } = await import('../rawCaptureGenuineness/rawCaptureGenuineness.service.js');
        await startVerificationJob({ companyId: session.companyId, user, sessionId: String(session._id), mode: 'all_qualified' });
    } catch (err) {
        ac.lastErrorCode = 'verify_start_failed';
        ac.lastErrorMessage = String(err?.message || 'Genuineness verification start failed').slice(0, 500);
    }
    await finalizeStop(session, { status: 'completed', reason: 'collection_complete_enrich_qualify_verify_started', user });
}

async function pauseForManual(session, message) {
    session.autoCollection.status = 'paused_manual';
    session.autoCollection.enabled = true;
    session.autoCollection.nextActionAt = null;
    session.autoCollection.discoveryStatus = 'paused';
    session.autoCollection.pauseReason = 'provider_block';
    session.autoCollection.providerState = 'Human Verification';
    session.autoCollection.lastErrorCode = 'manual_action_required';
    session.autoCollection.lastErrorMessage = String(message || 'Human verification required').slice(0, 500);
    session.autoCollection.lastDiscoveryAt = new Date();
    await session.save();
}

function isAgentOfflineWait(session) {
    const ac = session?.autoCollection || {};
    if (isLongAgentOfflinePause(session)) return false;
    return ac.pauseReason === 'agent_offline'
        || ac.discoveryStatus === 'waiting_for_agent'
        || ac.lastErrorCode === 'agent_offline';
}

export function isLongAgentOfflinePause(sessionOrAc = {}) {
    const ac = sessionOrAc.autoCollection || sessionOrAc;
    return String(ac?.pauseReason || '') === DISCOVERY_AGENT_OFFLINE
        || String(ac?.lastErrorCode || '') === DISCOVERY_AGENT_OFFLINE;
}

export function isOwnerManualPause(sessionOrAc = {}) {
    const ac = sessionOrAc.autoCollection || sessionOrAc;
    const reason = String(ac?.pauseReason || '');
    return reason === OWNER_PAUSE || reason === 'owner_pause';
}

export function collectionHasUnfinishedWork(session = {}) {
    const ac = session.autoCollection || {};
    const queryIndex = Number(ac.lastQueryIndex || ac.resumeQueryIndex || 1);
    const planned = Number(ac.totalApprovedQueries || 0);
    const completed = Number(ac.queriesCompleted || ac.queriesProcessedTotal || 0);
    if (planned > 0) {
        if (completed < planned) return true;
        if (queryIndex < planned) return true;
        return false;
    }
    // Planned total unknown: still mid-query if captures exist and no query has completed.
    if (completed === 0 && Number(ac.rawRecordsCaptured || session.acceptedCount || 0) > 0) return true;
    return false;
}

export function isInvalidCompletedCollection(session = {}) {
    if (isOwnerStopped(session)) return false;
    const ac = session.autoCollection || {};
    const reason = String(ac.summary?.stopReason || '');
    if (GENUINE_COMPLETE_REASONS.has(reason)) return false;
    if (!collectionHasUnfinishedWork(session)) return false;
    const sessionEnded = ['completed', 'expired', 'failed'].includes(String(session.status || ''));
    const acEnded = ['completed', 'failed'].includes(String(ac.status || ''))
        || ['completed', 'no_more_results'].includes(String(ac.discoveryStatus || ''));
    return sessionEnded || acEnded;
}

async function persistCheckpoint(session) {
    const ac = session.autoCollection || defaultAuto();
    session.autoCollection = ac;
    const page = Number(session.googlePageIndex || ac.lastSuccessfullyCapturedPage || 1);
    const lastOk = Number(ac.lastSuccessfullyCapturedPage || 0);
    ac.resumeQueryId = session.queryId || ac.resumeQueryId;
    ac.resumeQueryIndex = Number(ac.lastQueryIndex || ac.resumeQueryIndex || 1);
    ac.lastCursor = String(lastOk || page || '');
    ac.nextPageToken = String((lastOk || page || 1) + (lastOk && lastOk < page ? 0 : 1));
    ac.resumeMessage = `Resume from Query ${ac.resumeQueryIndex}, Page ${page}${lastOk && lastOk < page ? ' (retry unconfirmed page)' : ''}`;
}

async function pauseForLongAgentOffline(session, { message = AGENT_SLEEP_PAUSE_MESSAGE, fromInvalidComplete = false, rejectedReason = '' } = {}) {
    session.autoCollection = session.autoCollection || defaultAuto();
    const ac = session.autoCollection;
    await persistCheckpoint(session);
    ac.status = PAUSED_STATUS;
    ac.enabled = true;
    ac.phase = ac.phase && ac.phase !== 'done' ? ac.phase : 'decide_next';
    ac.discoveryStatus = 'paused';
    ac.pauseReason = DISCOVERY_AGENT_OFFLINE;
    ac.requiresManualResume = true;
    ac.lastErrorCode = DISCOVERY_AGENT_OFFLINE;
    ac.providerState = 'Provider temporarily unavailable';
    ac.lastErrorMessage = String(message || AGENT_SLEEP_PAUSE_MESSAGE).slice(0, 500);
    ac.nextActionAt = null;
    ac.tickLockUntil = null;
    ac.summary = { ...(ac.summary || {}), stopReason: fromInvalidComplete ? '' : (ac.summary?.stopReason || '') };
    if (fromInvalidComplete && rejectedReason) {
        ac.lastErrorMessage = AGENT_SLEEP_PAUSE_MESSAGE;
    }
    if (['completed', 'expired', 'failed'].includes(String(session.status || '')) && !isOwnerStopped(session)) {
        session.status = 'awaiting_user';
        session.completedAt = undefined;
        session.failedAt = undefined;
        session.failCode = '';
        session.failMessage = '';
        session.safeFailureMessage = '';
        session.sessionExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
        session.pendingCaptureStatus = 'none';
        session.pendingNavigationStatus = 'none';
    }
    ac.lastDiscoveryAt = new Date();
    await session.save();
    return session;
}

function nextAgentWaitDelaySec(attempt) {
    const i = Math.min(AGENT_WAIT_BACKOFF_SEC.length - 1, Math.max(0, Number(attempt) || 0));
    return AGENT_WAIT_BACKOFF_SEC[i];
}

/** Soft wait for Discovery Agent presence — campaign stays running; checkpoint is preserved. */
async function waitForAgentReconnect(session, message = '') {
    session.autoCollection = session.autoCollection || defaultAuto();
    const ac = session.autoCollection;
    if (isLongAgentOfflinePause(session)) {
        return { deferred: true, requiresManualResume: true };
    }
    if (!ac.agentWaitStartedAt) ac.agentWaitStartedAt = new Date();
    const waitedMs = Date.now() - new Date(ac.agentWaitStartedAt).getTime();
    const heartbeatAt = session.lastHeartbeatAt;
    const heartbeatAge = heartbeatAt ? (Date.now() - new Date(heartbeatAt).getTime()) : 0;
    if (waitedMs >= LONG_AGENT_OFFLINE_MS || heartbeatAge >= LONG_AGENT_OFFLINE_MS) {
        await persistCheckpoint(session);
        await pauseForLongAgentOffline(session);
        return { deferred: true, requiresManualResume: true };
    }
    const alreadyWaiting = isAgentOfflineWait(session);
    const nextAt = ac.nextActionAt ? new Date(ac.nextActionAt).getTime() : 0;
    if (alreadyWaiting && nextAt > Date.now()) {
        return { deferred: true };
    }
    const attempt = Number(ac.agentWaitAttempt || 0);
    const delaySec = nextAgentWaitDelaySec(attempt);
    ac.status = 'running';
    ac.enabled = true;
    ac.discoveryStatus = 'waiting_for_agent';
    ac.pauseReason = 'agent_offline';
    ac.lastErrorCode = 'agent_offline';
    ac.providerState = 'Provider temporarily unavailable';
    ac.lastErrorMessage = String(message || AGENT_OFFLINE_WAIT_MESSAGE).slice(0, 500);
    ac.agentWaitAttempt = attempt + 1;
    ac.nextActionAt = new Date(Date.now() + delaySec * 1000);
    ac.lastDiscoveryAt = new Date();
    ac.tickLockUntil = null;
    await persistCheckpoint(session);
    await session.save();
    return { deferred: false };
}

function clearAgentWait(session) {
    session.autoCollection = session.autoCollection || defaultAuto();
    const ac = session.autoCollection;
    ac.status = 'running';
    ac.enabled = true;
    ac.discoveryStatus = 'running';
    ac.pauseReason = '';
    ac.lastErrorCode = '';
    ac.lastErrorMessage = '';
    ac.providerState = 'Running';
    ac.agentWaitAttempt = 0;
    ac.agentWaitStartedAt = null;
    ac.nextActionAt = null;
    ac.lastDiscoveryAt = new Date();
}

/** Soft pause for rate-limit / non-agent technical issues — does not complete the campaign. */
async function pauseForTechnical(session, { reason = 'technical_retry', message = '' } = {}) {
    if (String(reason || '') === 'agent_offline') {
        return waitForAgentReconnect(session, message);
    }
    session.autoCollection = session.autoCollection || defaultAuto();
    session.autoCollection.status = 'paused_owner';
    session.autoCollection.enabled = true;
    session.autoCollection.nextActionAt = null;
    session.autoCollection.tickLockUntil = null;
    session.autoCollection.discoveryStatus = 'paused';
    session.autoCollection.pauseReason = String(reason || 'technical_retry').slice(0, 80);
    session.autoCollection.lastErrorCode = String(reason || 'technical_retry').slice(0, 80);
    session.autoCollection.providerState = 'Provider temporarily unavailable';
    session.autoCollection.lastErrorMessage = String(message || 'Provider temporarily unavailable. Resume when ready.').slice(0, 500);
    session.autoCollection.lastDiscoveryAt = new Date();
    await session.save();
}

export async function startAutoCollection({ companyId, user, sessionId, body = {} }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const session = await loadOwnedSession(cid, sessionId);
    if (ENDED.has(session.status)) throw new ApiError(400, 'Session ended. Start a new search before Auto Collection.');
    if (!READY.has(session.status) && session.status !== 'manual_action_required' && session.status !== 'capturing') {
        throw new ApiError(400, `Google must be Ready before Auto Collection (current: ${session.status})`);
    }
    await AssistedCaptureSession.updateMany(
        { companyId: cid, _id: { $ne: session._id }, 'autoCollection.status': { $in: ACTIVE_AUTO } },
        {
            $set: {
                'autoCollection.status': 'stopped', 'autoCollection.phase': 'done', 'autoCollection.enabled': false,
                'autoCollection.stoppedAt': new Date(), 'autoCollection.stoppedBy': actorId(user),
                'autoCollection.summary.stopReason': 'replaced_by_new_auto_collection',
            },
        },
    );
    const settings = readSettings(body);
    const unique = await campaignUnique(cid, session.campaignId);
    const base = defaultAuto();
    const pausedManual = session.status === 'manual_action_required';
    const campaignProgressSeed = await buildCampaignProgress({ companyId: cid, campaignId: session.campaignId, session: session.toObject() });
    const persistedQueryTotal = Number(campaignProgressSeed?.queryTotal || 0);
    // Never truncate a persisted China/model plan (e.g. 103) down to the UI default of 24.
    if (persistedQueryTotal > 0) {
        settings.maxQueries = Math.min(persistedQueryTotal, MAX_MODEL_CHINA_QUERIES);
    }
    const totalApprovedQueries = Number(settings.maxQueries || persistedQueryTotal || 24);
    session.autoCollection = {
        ...base, ...settings, enabled: true,
        status: pausedManual ? 'paused_manual' : 'running',
        phase: pausedManual ? 'none' : 'delay',
        discoveryStatus: pausedManual ? 'paused' : 'running',
        pauseReason: pausedManual ? 'provider_block' : '',
            ownerStoppedAt: null,
            stopRequested: false,
        collectionMode: settings.collectionMode,
        requestedCaptureTarget: settings.requestedCaptureTarget,
        sourceResultsFound: Number(session.visibleResultCount || 0),
        rawRecordsCaptured: Number(session.acceptedCount || 0),
        lastQueryIndex: Number(campaignProgressSeed?.queryIndex || 1),
        queriesCompleted: 0,
        totalApprovedQueries,
        pagesInWorkerCycle: 0,
        workerCycleCount: 0,
        lastDiscoveryAt: new Date(),
        uniqueAtStart: unique, startedAt: new Date(), startedBy: actorId(user),
        currentBatch: 1, pagesInCurrentBatch: 0, batchStartPage: Number(session.googlePageIndex || 1),
        lastSuccessfullyCapturedPage: Number(session.googlePageIndex || 0), batchMessage: '',
        resumeQueryId: session.queryId, resumeQueryIndex: Number(campaignProgressSeed?.queryIndex || 1),
        resumeMessage: '',
        pagesPerBatch: settings.pagesPerBatch, maxSafetyPagesPerQuery: settings.maxSafetyPagesPerQuery,
        pauseAfterEachBatch: settings.pauseAfterEachBatch, pageCollectionMode: settings.pageCollectionMode,
        rootSessionId: session._id, campaignId: session.campaignId,
        nextActionAt: pausedManual ? null : new Date(Date.now() + randomDelayMs(settings.delayMinSec, settings.delayMaxSec)),
        summary: { ...base.summary },
    };
    await session.save();
    const campaignProgress = await buildCampaignProgress({ companyId: cid, campaignId: session.campaignId, session: session.toObject() });
    const modeLabel = settings.collectionMode === 'fixed_target'
        ? `Fixed Target (${settings.requestedCaptureTarget} raw source results)`
        : 'Unlimited — Until No More Results';
    return {
        session: sanitizeSession(session.toObject()),
        autoCollection: progressView(session.toObject(), campaignProgress),
        campaignProgress,
        message: pausedManual
            ? 'Manual action required in the Google window. Resolve it, then click Continue Auto Collection.'
            : `Auto Collection started (${modeLabel}). CAPTCHA/consent pause for you.`,
    };
}

export async function pauseAutoCollection({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const session = await loadOwnedSession(cid, sessionId);
    if (isOwnerStopped(session)) throw new ApiError(400, 'STOPPED BY USER. This search will not resume. Start a new search.');
    if ((session.autoCollection?.status || 'idle') !== 'running') throw new ApiError(400, 'Auto Collection is not running');
    session.autoCollection.status = 'paused_owner';
    session.autoCollection.enabled = true;
    session.autoCollection.nextActionAt = null;
    session.autoCollection.discoveryStatus = 'paused';
    session.autoCollection.pauseReason = OWNER_PAUSE;
    session.autoCollection.requiresManualResume = true;
    session.autoCollection.lastDiscoveryAt = new Date();
    await session.save();
    const campaignProgress = await buildCampaignProgress({ companyId: cid, campaignId: session.campaignId, session: session.toObject() });
    return {
        session: sanitizeSession(session.toObject()),
        autoCollection: progressView(session.toObject(), campaignProgress),
        campaignProgress,
        message: 'Auto Collection paused. Captured results are preserved.',
    };
}

export async function resumeAutoCollection({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const session = await loadOwnedSession(cid, sessionId);
    const st = session.autoCollection?.status || 'idle';
    if (isOwnerStopped(session)) throw new ApiError(400, 'STOPPED BY USER. This search will not resume. Start a new search.');
    if (st === 'paused_manual') throw new ApiError(400, 'Resolve the Google window issue first, then click Continue Auto Collection.');
    const waitingAgent = st === 'running' && isAgentOfflineWait(session);
    const longOffline = isLongAgentOfflinePause(session);
    const invalidComplete = isInvalidCompletedCollection(session);
    if (st !== 'paused_owner' && st !== PAUSED_STATUS && !waitingAgent && !longOffline && !invalidComplete) {
        throw new ApiError(400, 'Auto Collection is not paused');
    }
    if (session.status === 'manual_action_required') {
        session.autoCollection.status = 'paused_manual';
        await session.save();
        throw new ApiError(400, 'Manual action required in the Google window.');
    }
    if (ENDED.has(session.status) && !isOwnerStopped(session)) {
        session.status = 'awaiting_user';
        session.completedAt = undefined;
        session.failedAt = undefined;
        session.failCode = '';
        session.failMessage = '';
        session.safeFailureMessage = '';
        session.sessionExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
        session.pendingCaptureStatus = 'none';
        session.pendingNavigationStatus = 'none';
    }
    await persistCheckpoint(session);
    const lastOk = Number(session.autoCollection.lastSuccessfullyCapturedPage || 0);
    const currentPage = Number(session.googlePageIndex || 1);
    if (lastOk > 0 && currentPage > lastOk) {
        session.autoCollection.phase = 'capture';
        session.autoCollection.resumeMessage = `Retrying unconfirmed page ${currentPage} of query ${session.autoCollection.resumeQueryIndex || 1}`;
    } else if (['done', 'none'].includes(session.autoCollection.phase)) {
        session.autoCollection.phase = 'decide_next';
    }
    session.autoCollection.status = 'running';
    session.autoCollection.enabled = true;
    session.autoCollection.discoveryStatus = 'running';
    session.autoCollection.pauseReason = '';
    session.autoCollection.requiresManualResume = false;
    session.autoCollection.lastErrorCode = '';
    session.autoCollection.lastErrorMessage = '';
    session.autoCollection.providerState = 'Running';
    session.autoCollection.agentWaitAttempt = 0;
    session.autoCollection.agentWaitStartedAt = null;
    session.autoCollection.summary = { ...(session.autoCollection.summary || {}), stopReason: '' };
    session.autoCollection.lastDiscoveryAt = new Date();
    scheduleDelay(session);
    await session.save();
    const campaignProgress = await buildCampaignProgress({ companyId: cid, campaignId: session.campaignId, session: session.toObject() });
    return {
        session: sanitizeSession(session.toObject()),
        autoCollection: progressView(session.toObject(), campaignProgress),
        campaignProgress,
        message: 'Auto Collection resumed.',
    };
}

export async function stopAutoCollection({ companyId, user, sessionId, reason = 'owner_stop' }) {
    return ownerStopPersistentRun({ companyId, user, sessionId, reason: reason || 'owner_stop' });
}

export async function continueAutoCollectionAfterManual({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const probe = await loadOwnedSession(cid, sessionId);
    if (isOwnerStopped(probe)) {
        throw new ApiError(400, 'STOPPED BY USER. This search will not resume. Start a new search.');
    }
    const { continueSimpleLeadSearchAfterManual } = await import('./simpleLeadSearch.service.js');
    await continueSimpleLeadSearchAfterManual({ companyId: cid, user, sessionId });
    const session = await loadOwnedSession(cid, sessionId);
    const src = String(session.source || session.sourceHint || '').toLowerCase();
    const stillBlockedMsg = src === '1688'
        ? '1688 still needs verification. Complete it in the Discovery Agent browser, then click Continue After Manual Action.'
        : (['baidu', 'sogou', 'so360'].includes(src)
            ? `${src === 'so360' ? '360 Search' : (src === 'sogou' ? 'Sogou' : 'Baidu')} still needs verification in the Discovery Agent browser, then click Continue After Manual Action.`
            : 'Google is still not Ready. Finish CAPTCHA/consent in the managed browser, then try again.');
    if (session.status === 'manual_action_required') {
        throw new ApiError(400, stillBlockedMsg);
    }
    if (!READY.has(session.status)) throw new ApiError(400, stillBlockedMsg);
    session.autoCollection = session.autoCollection || defaultAuto();
    session.autoCollection.status = 'running';
    session.autoCollection.enabled = true;
    session.autoCollection.lastErrorCode = '';
    session.autoCollection.lastErrorMessage = '';
    scheduleDelay(session);
    await session.save();
    const campaignProgress = await buildCampaignProgress({ companyId: cid, campaignId: session.campaignId, session: session.toObject() });
    return {
        session: sanitizeSession(session.toObject()),
        autoCollection: progressView(session.toObject(), campaignProgress),
        campaignProgress,
        message: 'Continuing Auto Collection after manual action.',
    };
}
function isDiscoveryStalled(session) {
    const ac = session?.autoCollection || {};
    if (ac.status !== 'running') return false;
    if (isAgentOfflineWait(session)) return false;
    if (ac.nextActionAt && new Date(ac.nextActionAt).getTime() > Date.now()) return false;
    const last = ac.lastDiscoveryAt || ac.lastPageAdvancementAt || session.lastCaptureAt;
    if (!last) return false;
    return (Date.now() - new Date(last).getTime()) > DISCOVERY_STALL_MS;
}

async function handleUnsupportedPageOutcome(session, user, cid) {
    const ac = session.autoCollection || defaultAuto();
    session.autoCollection = ac;
    const msg = String(session.failMessage || ac.lastErrorMessage || '');
    const kind = parsePageKindFromMessage(msg);

    if (HUMAN_PAGE_KINDS.includes(kind) || session.status === 'manual_action_required') {
        session.status = 'manual_action_required';
        session.manualActionMessage = kind
            ? `Human verification required (${kind}). Resolve in the Google window.`
            : (session.manualActionMessage || 'Human verification required');
        await pauseForManual(session, session.manualActionMessage);
        return { handled: true, outcome: 'human_verification' };
    }

    const pageKey = unsupportedPageKeyOf(session);
    if (ac.unsupportedPageKey !== pageKey) {
        ac.unsupportedPageKey = pageKey;
        ac.unsupportedRetryCount = 0;
    }
    const retries = Number(ac.unsupportedRetryCount || 0);
    if (retries < MAX_UNSUPPORTED_PAGE_RETRIES) {
        ac.unsupportedRetryCount = retries + 1;
        ac.providerState = 'Retry';
        ac.discoveryStatus = 'running';
        ac.pauseReason = 'unsupported_page_retry';
        ac.lastErrorCode = 'unsupported_page_retry';
        ac.lastErrorMessage = `Waiting on provider / retrying page ${session.googlePageIndex || '?'} (attempt ${ac.unsupportedRetryCount}/${MAX_UNSUPPORTED_PAGE_RETRIES}).`;
        session.status = 'awaiting_user';
        session.failCode = '';
        session.failMessage = '';
        session.failedAt = undefined;
        session.pendingCaptureStatus = 'none';
        session.pendingCaptureAckedAt = null;
        ac.phase = 'capture';
        ac.status = 'running';
        ac.enabled = true;
        ac.nextActionAt = new Date(Date.now() + randomDelayMs(ac.delayMinSec || 8, Math.max(ac.delayMinSec || 8, Math.min(ac.delayMaxSec || 20, 20))));
        ac.lastDiscoveryAt = new Date();
        await session.save();
        return { handled: true, outcome: 'retry' };
    }

    ac.unsupportedRetryCount = 0;
    ac.unsupportedPageKey = '';
    ac.providerState = 'Exhausted';
    ac.pauseReason = '';
    ac.lastErrorCode = 'unsupported_page_skipped';
    ac.lastErrorMessage = `Query page ${session.googlePageIndex || ''} unsupported after retries. Advancing to the next query.`;
    ac.phase = 'complete_query';
    ac.discoveryStatus = 'running';
    ac.status = 'running';
    ac.enabled = true;
    ac.nextActionAt = null;
    session.status = 'awaiting_user';
    session.failCode = '';
    session.failMessage = '';
    session.failedAt = undefined;
    session.pendingCaptureStatus = 'none';
    session.pendingCaptureAckedAt = null;
    await session.save();
    return runPhase(session, user, cid);
}

async function runPhase(session, user, cid) {
    if (await ownerStopAborted(session)) return {};
    const ac = session.autoCollection;
    const now = Date.now();

    if (isPageOutcomeFail(session) && ac.status === 'running') {
        return handleUnsupportedPageOutcome(session, user, cid);
    }
    if (isDiscoveryStalled(session) && !HUMAN_PAGE_KINDS.includes(parsePageKindFromMessage(ac.lastErrorMessage))) {
        const last = ac.lastDiscoveryAt || ac.lastPageAdvancementAt || session.lastCaptureAt;
        const gapMs = last ? (Date.now() - new Date(last).getTime()) : 0;
        if (gapMs >= LONG_AGENT_OFFLINE_MS) {
            await persistCheckpoint(session);
            await pauseForLongAgentOffline(session);
            return {};
        }
        const heartbeatAt = session.lastHeartbeatAt || ac.lastDiscoveryAt;
        const heartbeatAge = heartbeatAt ? (Date.now() - new Date(heartbeatAt).getTime()) : gapMs;
        if (heartbeatAge >= DISCOVERY_STALL_MS) {
            return waitForAgentReconnect(session, AGENT_OFFLINE_WAIT_MESSAGE);
        }
        ac.lastErrorCode = ac.lastErrorCode || 'discovery_stalled';
        ac.lastErrorMessage = ac.lastErrorMessage || `No page/query advancement for ${Math.round(DISCOVERY_STALL_MS / 1000)}s. Inspecting current page.`;
        return handleUnsupportedPageOutcome(session, user, cid);
    }

    if (ac.phase === 'await_cycle') {
        if (ac.nextActionAt && new Date(ac.nextActionAt).getTime() > now) {
            await session.save();
            return {};
        }
        // Worker-cycle safety reached — continue from next page (do not re-capture same page)
        ac.discoveryStatus = 'running';
        ac.pauseReason = '';
        ac.lastErrorCode = '';
        ac.lastErrorMessage = '';
        ac.phase = 'next_page';
        await session.save();
        return runPhase(session, user, cid);
    }

    if (ac.phase === 'delay' || ac.phase === 'none') {
        if (ac.nextActionAt && new Date(ac.nextActionAt).getTime() > now) {
            await session.save();
            return {};
        }
        if (!READY.has(session.status)) {
            if (['opening', 'queued', 'agent_assigned'].includes(session.status)) {
                ac.phase = 'await_query_ready';
                await session.save();
                return {};
            }
            await session.save();
            return {};
        }
        ac.phase = 'capture';
    }

    if (ac.phase === 'await_query_ready' || ac.phase === 'await_nav') {
        if (session.status === 'manual_action_required') {
            await pauseForManual(session, session.manualActionMessage);
            return {};
        }
        if (!READY.has(session.status) || ['pending', 'acked'].includes(session.pendingNavigationStatus)) {
            await session.save();
            return {};
        }
        scheduleDelay(session);
        await session.save();
        return {};
    }

    if (ac.phase === 'capture') {
        if (!READY.has(session.status) && session.status !== 'capturing') {
            await session.save();
            return {};
        }
        if (['pending', 'acked'].includes(session.pendingCaptureStatus)) {
            ac.phase = 'await_capture';
            await session.save();
            return {};
        }
        if (await ownerStopAborted(session)) return {};
        ac.uniqueBeforeLastCapture = await campaignUnique(cid, session.campaignId);
        ac.captureEventsAtLastRequest = Number(session.captureEventCount || 0);
        ac.insertedAtLastRequest = Number(session.insertedCount || 0);
        ac.updatedAtLastRequest = Number(session.updatedExistingCount || 0);
        await session.save();
        await requestCaptureVisibleResults({
            companyId: cid, user, campaignId: session.campaignId, queryId: session.queryId, sessionId: session._id,
            body: { idempotencyKey: `sls-auto-${session._id}-${Date.now()}` },
        });
        await AssistedCaptureSession.updateOne(
            {
                _id: session._id,
                'autoCollection.status': 'running',
                'autoCollection.stopRequested': { $ne: true },
                'autoCollection.ownerStoppedAt': null,
                status: { $nin: [...ENDED] },
            },
            { $set: { 'autoCollection.phase': 'await_capture' } },
        );
        return { reload: true };
    }

    if (ac.phase === 'await_capture') {
        const pending = session.pendingCaptureStatus || 'none';
        const events = Number(session.captureEventCount || 0);
        const baseline = Number(ac.captureEventsAtLastRequest || 0);
        // Fallback: completed events may exist even if pendingCaptureStatus stuck at acked
        // (legacy race). Count terminal events since baseline.
        const terminalEvents = await AssistedCaptureEvent.countDocuments({
            companyId: cid,
            sessionId: session._id,
            status: { $in: ['completed', 'partially_completed'] },
        });
        const acceptedDelta = Math.max(0, Number(session.acceptedCount || 0) - Number(ac.insertedAtLastRequest || 0));
        const captureDone = terminalEvents > baseline
            || acceptedDelta > 0
            || (READY.has(session.status) && !['pending', 'acked'].includes(pending) && events > baseline);

        if (!captureDone && isPageOutcomeFail(session)) {
            return handleUnsupportedPageOutcome(session, user, cid);
        }
        const failedIngest = await AssistedCaptureEvent.countDocuments({
            companyId: cid,
            sessionId: session._id,
            status: 'failed',
            acceptedCount: { $lte: 0 },
        });
        if (['pending', 'acked'].includes(pending) && failedIngest > 0 && !captureDone) {
            session.pendingCaptureStatus = 'none';
            session.pendingCaptureAckedAt = null;
            const alreadyRetried = ac.lastErrorCode === 'capture_ingest_failed';
            ac.lastErrorCode = 'capture_ingest_failed';
            if (alreadyRetried) {
                ac.status = 'paused_owner';
                ac.pauseReason = 'capture_ingest_failed';
                ac.lastErrorMessage = 'Capture ingest failed. Automatic collection paused. Captured count stayed 0.';
                await session.save();
                return {};
            }
            ac.lastErrorMessage = 'Capture ingest failed. Retrying visible capture.';
            ac.phase = 'capture';
            await session.save();
            return { reload: true };
        }

        if (['pending', 'acked'].includes(pending) && !captureDone) {
            if (session.status === 'capturing') {
                await session.save();
                return {};
            }
            await session.save();
            return {};
        }
        if (!captureDone && events <= baseline && !READY.has(session.status)) {
            await session.save();
            return {};
        }
        // Clear stuck pending if we already have accepted capture progress
        if (['pending', 'acked'].includes(pending) && captureDone) {
            session.pendingCaptureStatus = 'none';
            session.pendingCaptureAckedAt = null;
        }
        const uniqueAfter = await campaignUnique(cid, session.campaignId);
        const newUnique = Math.max(0, uniqueAfter - Number(ac.uniqueBeforeLastCapture || 0));
        const insertedDelta = Math.max(0, Number(session.insertedCount || 0) - Number(ac.insertedAtLastRequest || 0));
        const updatedDelta = Math.max(0, Number(session.updatedExistingCount || 0) - Number(ac.updatedAtLastRequest || 0));
        const pageAccepted = Math.max(insertedDelta + updatedDelta, acceptedDelta, Number(session.visibleResultCount || 0) ? Number(ac.lastPageVisible || 0) : 0);
        ac.lastPageVisible = Number(session.visibleResultCount || ac.lastPageVisible || 0);
        ac.lastPageNewUnique = newUnique || insertedDelta;
        ac.lastPageUpdated = updatedDelta;
        ac.pagesCapturedThisQuery = Number(ac.pagesCapturedThisQuery || 0) + 1;
        ac.pagesProcessedTotal = Number(ac.pagesProcessedTotal || 0) + 1;
        ac.pagesInCurrentBatch = Number(ac.pagesInCurrentBatch || 0) + 1;
        ac.pagesInWorkerCycle = Number(ac.pagesInWorkerCycle || 0) + 1;
        ac.lastSuccessfullyCapturedPage = Number(session.googlePageIndex || ac.pagesCapturedThisQuery);
        ac.lastQueryIndex = Number(ac.queriesProcessedTotal || 0) + 1;
        ac.lastCursor = String(session.googlePageIndex || ac.lastSuccessfullyCapturedPage || '');
        ac.nextPageToken = String(Number(session.googlePageIndex || 0) + 1);
        ac.lastDiscoveryAt = new Date();
        ac.lastNewResultAt = ac.lastDiscoveryAt;
        ac.lastPageAdvancementAt = ac.lastDiscoveryAt;
        ac.unsupportedRetryCount = 0;
        ac.unsupportedPageKey = '';
        ac.providerState = 'Running';
        ac.pauseReason = '';
        ac.discoveryStatus = 'running';
        ac.rawRecordsCaptured = await acceptedSourceAppearances(session);
        ac.sourceResultsFound = Math.max(Number(ac.sourceResultsFound || 0), Number(session.visibleResultCount || 0));
        ac.queriesCompleted = Number(ac.queriesProcessedTotal || 0);
        await persistCheckpoint(session);
        if (!ac.batchStartPage) ac.batchStartPage = Number(session.googlePageIndex || 1);
        if (!ac.currentBatch) ac.currentBatch = 1;
        ac.consecutiveNoNewPages = ((newUnique || insertedDelta || pageAccepted) <= 0)
            ? Number(ac.consecutiveNoNewPages || 0) + 1
            : 0;
        await refreshQueryCaptureStats({ companyId: cid, campaignId: session.campaignId, queryId: session.queryId });
        ac.phase = 'decide_next';
        await session.save();
        return runPhase(session, user, cid);
    }

    if (ac.phase === 'decide_next') {
        // Update checkpoint after each successful page
        ac.lastSuccessfullyCapturedPage = Number(session.googlePageIndex || ac.pagesCapturedThisQuery || 0);
        ac.resumeQueryId = session.queryId;
        ac.resumeQueryIndex = Number(ac.queriesProcessedTotal || 0) + 1;
        ac.resumeMessage = `Resume Auto Collection from Query ${ac.resumeQueryIndex}, Page ${ac.lastSuccessfullyCapturedPage || 1}`;
        ac.lastCursor = String(ac.lastSuccessfullyCapturedPage || '');
        ac.nextPageToken = String(Number(ac.lastSuccessfullyCapturedPage || 0) + 1);
        await persistCheckpoint(session);

        if (await maybeFinishLimits(session, user)) return { reload: true };

        const collectionMode = resolveCollectionMode(ac);
        const mode = collectionMode === 'unlimited'
            ? 'until_no_more'
            : (ac.pageCollectionMode || 'until_no_more');
        const pagesThisQ = Number(ac.pagesCapturedThisQuery || 0);
        const pagesInBatch = Number(ac.pagesInCurrentBatch || 0);
        const pagesPerBatch = Number(ac.pagesPerBatch || 10);
        const fixedLimit = Number(ac.maxPagesPerQuery || 3);
        const workerCycleLimit = Number(ac.maxSafetyPagesPerQuery || DEFAULT_WORKER_CYCLE_PAGES);
        const pagesInCycle = Number(ac.pagesInWorkerCycle || 0);

        // Worker-cycle safety: persist + auto-continue (never mark campaign completed)
        if ((mode === 'until_no_more' || mode === 'batches')
            && pagesInCycle >= workerCycleLimit) {
            scheduleWorkerCycleContinue(session);
            await session.save();
            return { reload: true };
        }

        if (mode === 'fixed') {
            if (pagesThisQ >= fixedLimit) {
                ac.phase = 'complete_query';
                await session.save();
                return runPhase(session, user, cid);
            }
        } else if (mode === 'batches') {
            if (pagesInBatch >= pagesPerBatch) {
                if (ac.pauseAfterEachBatch !== false) {
                    const startP = Number(ac.batchStartPage || 1);
                    const endP = Number(ac.lastSuccessfullyCapturedPage || pagesThisQ);
                    const uniqueNow = await campaignUnique(cid, session.campaignId);
                    ac.status = 'paused_batch';
                    ac.phase = 'await_batch_continue';
                    ac.enabled = true;
                    ac.discoveryStatus = 'paused';
                    ac.pauseReason = 'batch_pause';
                    ac.nextActionAt = null;
                    ac.batchMessage = `Batch completed: Pages ${startP}–${endP}. Campaign unique records: ${uniqueNow}. More Google pages may be available.`;
                    await session.save();
                    return { reload: true };
                }
                // auto-advance to next batch without pause
                ac.currentBatch = Number(ac.currentBatch || 1) + 1;
                ac.pagesInCurrentBatch = 0;
                ac.batchStartPage = Number(ac.lastSuccessfullyCapturedPage || pagesThisQ) + 1;
                ac.batchMessage = '';
            }
        }
        // until_no_more / unlimited: never stop for page count here — only worker-cycle continue above

        ac.phase = 'next_page';
        await session.save();
        return runPhase(session, user, cid);
    }

    if (ac.phase === 'next_page') {
        if (await ownerStopAborted(session)) return {};
        if (!READY.has(session.status)) { await session.save(); return {}; }
        try {
            await openNextGooglePage({ companyId: cid, user, sessionId: session._id });
        } catch (err) {
            ac.lastErrorCode = 'google_no_more_pages';
            ac.lastErrorMessage = String(err?.message || 'No more Google pages').slice(0, 500);
            if ((ac.pageCollectionMode || 'fixed') === 'until_no_more' || (ac.pageCollectionMode || '') === 'batches') {
                ac.phase = 'complete_query';
                await session.save();
                return runPhase(session, user, cid);
            }
            await finalizeStop(session, { status: 'completed', reason: 'google_no_more_pages', user });
            return { reload: true };
        }
        await AssistedCaptureSession.updateOne(
            {
                _id: session._id,
                'autoCollection.status': 'running',
                'autoCollection.stopRequested': { $ne: true },
                'autoCollection.ownerStoppedAt': null,
                status: { $nin: [...ENDED] },
            },
            { $set: { 'autoCollection.phase': 'await_nav' } },
        );
        return { reload: true };
    }

    if (ac.phase === 'complete_query') {
        await markQueryComplete({ companyId: cid, user, sessionId: session._id });
        ac.queriesProcessedTotal = Number(ac.queriesProcessedTotal || 0) + 1;
        ac.queriesCompleted = Number(ac.queriesProcessedTotal || 0);
        ac.pagesInWorkerCycle = 0;
        ac.lastDiscoveryAt = new Date();
        if (Number(ac.queriesProcessedTotal || 0) >= Number(ac.maxQueries || ac.totalApprovedQueries || 3)) {
            await startPostCollectionJobs(session, user);
            return { reload: true };
        }
        ac.phase = 'next_query';
        await session.save();
        return runPhase(session, user, cid);
    }

    if (ac.phase === 'next_query') {
        if (await ownerStopAborted(session)) return {};
        const snapshot = session.toObject();
        let next;
        try {
            next = await openNextGeneratedQuery({ companyId: cid, user, sessionId: session._id, headers: {} });
        } catch (err) {
            const latest = await AssistedCaptureSession.findById(session._id).lean();
            if (isOwnerStopped(latest)) return {};
            if (Number(err?.statusCode) === 400) {
                if (collectionHasUnfinishedWork(session)) {
                    await persistCheckpoint(session);
                    await pauseForLongAgentOffline(session, { rejectedReason: 'next_query_failed' });
                    return { reload: true };
                }
                await startPostCollectionJobs(session, user);
                return { reload: true };
            }
            throw err;
        }
        const afterOpen = await AssistedCaptureSession.findById(session._id).lean();
        if (isOwnerStopped(afterOpen)) {
            const newIdEarly = next?.session?._id;
            if (newIdEarly) {
                await AssistedCaptureSession.updateMany(
                    { _id: { $in: [session._id, newIdEarly] }, companyId: cid },
                    { $set: ownerStopSet(new Date(), user) },
                );
            }
            return { reload: true };
        }
        const newId = next.session?._id;

        // Soft-flush in-flight CP6→8 on the old session WHILE AP is still enabled
        try {
            const { onCaptureStoppedFlush } = await import('./simpleLeadSearch.autoProcessing.service.js');
            await onCaptureStoppedFlush({ companyId: cid, user, sessionId: String(session._id) });
        } catch {
            /* soft — handoff must not fail */
        }

        await AssistedCaptureSession.updateOne(
            { _id: session._id },
            {
                $set: {
                    'autoCollection.status': 'stopped',
                    'autoCollection.phase': 'done',
                    'autoCollection.enabled': false,
                    'autoCollection.summary.stopReason': 'handed_off_to_next_query_session',
                    // Stop ticking AP on the old session; state is transferred below
                    'autoProcessing.enabled': false,
                    'autoProcessing.status': 'stopped',
                    'autoProcessing.currentStage': 'done',
                    'autoProcessing.lastErrorCode': 'handed_off_to_next_query_session',
                    'autoProcessing.lastErrorMessage': 'Automatic processing moved to the next-query session.',
                },
            },
        );
        const transferred = {
            ...(snapshot.autoCollection || {}),
            status: 'running', enabled: true, phase: 'await_query_ready',
            discoveryStatus: 'running', pauseReason: '',
            pagesCapturedThisQuery: 0, pagesInCurrentBatch: 0, pagesInWorkerCycle: 0,
            currentBatch: 1, batchStartPage: 1, lastSuccessfullyCapturedPage: 0, batchMessage: '', consecutiveNoNewPages: 0, nextActionAt: null, tickLockUntil: null,
            queriesCompleted: Number(snapshot.autoCollection?.queriesProcessedTotal || 0) + 1,
            lastQueryIndex: Number(snapshot.autoCollection?.queriesProcessedTotal || 0) + 2,
            lastDiscoveryAt: new Date(),
            lastPageAdvancementAt: new Date(),
            unsupportedRetryCount: 0,
            unsupportedPageKey: '',
            providerState: 'Running',
            lastErrorCode: '',
            lastErrorMessage: '',
            rootSessionId: snapshot.autoCollection?.rootSessionId || snapshot._id,
            campaignId: snapshot.campaignId,
        };
        const setDoc = { autoCollection: transferred };

        // Critical: transfer continuous CP6→CP8 pipeline with the new collection session.
        // Without this, Auto Collection keeps running on the new session while AP ticks die on the old one.
        const apSnap = snapshot.autoProcessing;
        if (apSnap && (apSnap.enabled || ['running', 'paused_owner', 'completed'].includes(apSnap.status))) {
            setDoc.autoProcessing = {
                ...apSnap,
                enabled: true,
                ownerWorkflowEnabled: true,
                status: apSnap.status === 'paused_owner' ? 'paused_owner' : 'running',
                currentStage: (apSnap.currentStage === 'done' || apSnap.status === 'completed')
                    ? 'waiting_batch'
                    : (apSnap.currentStage || 'waiting_batch'),
                // Jobs are session-scoped — clear in-flight refs; processed keys / batch counters preserved
                currentEnrichJobId: null,
                currentQualifyJobId: null,
                currentVerifyJobId: null,
                currentBatchCaptureIds: [],
                currentBatchEnrichmentIds: [],
                currentBatchQualificationIds: [],
                tickLockUntil: null,
                flushRequested: false,
                autoCreateCrmLeads: false,
                autoResumeNotice: false,
                rootSessionId: apSnap.rootSessionId || snapshot._id,
                campaignId: snapshot.campaignId || apSnap.campaignId || null,
                lastErrorCode: '',
                lastErrorMessage: '',
            };
        }

        await AssistedCaptureSession.updateOne({ _id: newId }, { $set: setDoc });

        return { sessionId: String(newId), reload: true };
    }

    await session.save();
    return {};
}

export async function tickAutoCollection({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureView(user);

    // Soft-reclaim discovery when a prior race marked session/AC failed after accepted ingest
    const probe = await AssistedCaptureSession.findOne({ _id: sessionId, companyId: cid }).lean();
    if (probe && isOwnerStopped(probe)) {
        const campaignProgress = await buildCampaignProgress({ companyId: cid, campaignId: probe.campaignId, session: probe });
        return {
            session: sanitizeSession(probe),
            autoCollection: progressView(probe, campaignProgress),
            campaignProgress,
            sessionId: String(sessionId),
            advanced: false,
            skipped: true,
            stopped: true,
        };
    }
    if (probe && (isInvalidCompletedCollection(probe) || isLongAgentOfflinePause(probe))) {
        const live = await loadOwnedSession(cid, sessionId);
        if (isInvalidCompletedCollection(live) && !isLongAgentOfflinePause(live)) {
            await persistCheckpoint(live);
            await pauseForLongAgentOffline(live, { fromInvalidComplete: true });
        }
        const paused = await AssistedCaptureSession.findById(sessionId).lean();
        const campaignProgress = paused
            ? await buildCampaignProgress({ companyId: cid, campaignId: paused.campaignId, session: paused })
            : null;
        return {
            session: sanitizeSession(paused),
            autoCollection: paused ? progressView(paused, campaignProgress) : null,
            campaignProgress,
            sessionId: String(sessionId),
            advanced: false,
            skipped: true,
            requiresManualResume: true,
        };
    }
    if (probe) {
        const accepted = Math.max(
            Number(probe.acceptedCount || 0),
            Number(probe.autoCollection?.rawRecordsCaptured || 0),
        );
        const collectionMode = resolveCollectionMode(probe.autoCollection || {});
        const target = Number(probe.autoCollection?.requestedCaptureTarget || 0);
        const stopReason = String(probe.autoCollection?.summary?.stopReason || '');
        const targetMet = collectionMode === 'fixed_target' && target > 0 && accepted >= target;
        const canReclaim = accepted > 0
            && !targetMet
            && !isOwnerStopped(probe)
            && !isPageOutcomeFail(probe)
            && (
                probe.status === 'failed'
                || probe.autoCollection?.status === 'failed'
                || stopReason === 'session_failed'
                || stopReason === 'max_safety_pages_reached'
            )
            && !['owner_stop', 'capture_target_reached', 'google_no_more_pages', 'all_queries_exhausted'].includes(stopReason);
        if (canReclaim) {
            await AssistedCaptureSession.updateOne(
                { _id: sessionId, companyId: cid },
                {
                    $set: {
                        status: 'awaiting_user',
                        failCode: '',
                        failMessage: '',
                        pendingCaptureStatus: 'none',
                        'autoCollection.status': 'running',
                        'autoCollection.enabled': true,
                        'autoCollection.phase': ['await_capture', 'done', 'none'].includes(probe.autoCollection?.phase)
                            ? 'decide_next'
                            : (probe.autoCollection?.phase || 'decide_next'),
                        'autoCollection.discoveryStatus': 'running',
                        'autoCollection.summary.stopReason': '',
                        'autoCollection.lastErrorCode': 'session_recovered_after_accepted_ingest',
                        'autoCollection.lastErrorMessage': 'Recovered after accepted capture; continuing discovery.',
                    },
                    $unset: { failedAt: 1 },
                },
            );
        }
    }

    let session = await AssistedCaptureSession.findOneAndUpdate(
        {
            _id: sessionId,
            companyId: cid,
            'autoCollection.stopRequested': { $ne: true },
            'autoCollection.ownerStoppedAt': null,
            status: { $nin: ['cancelled', 'completed', 'expired'] },
            $and: [
                {
                    $or: [
                        { 'autoCollection.status': 'running' },
                        {
                            'autoCollection.status': 'paused_owner',
                            'autoCollection.pauseReason': 'agent_offline',
                        },
                    ],
                },
                {
                    $or: [
                        { 'autoCollection.tickLockUntil': null },
                        { 'autoCollection.tickLockUntil': { $lte: new Date() } },
                        { 'autoCollection.tickLockUntil': { $exists: false } },
                    ],
                },
            ],
        },
        { $set: { 'autoCollection.tickLockUntil': new Date(Date.now() + 8000) } },
        { new: true },
    );

    if (!session) {
        const current = await AssistedCaptureSession.findOne({ _id: sessionId, companyId: cid }).lean();
        const campaignProgress = current
            ? await buildCampaignProgress({ companyId: cid, campaignId: current.campaignId, session: current })
            : null;
        return {
            session: sanitizeSession(current),
            autoCollection: current ? progressView(current, campaignProgress) : null,
            campaignProgress,
            sessionId: String(sessionId),
            advanced: false,
            skipped: true,
        };
    }

    let switchedSessionId = null;
    // Prefer CAPTCHA/manual pause over agent-offline (manual_action_required first)
    if (session.status === 'manual_action_required') {
        await pauseForManual(session, session.manualActionMessage || 'Human verification required');
    } else if (isPageOutcomeFail(session) && !isOwnerStopped(session) && session.autoCollection?.status === 'running') {
        try {
            const outcome = await handleUnsupportedPageOutcome(session, user, cid);
            if (outcome?.sessionId && String(outcome.sessionId) !== String(session._id)) {
                switchedSessionId = String(outcome.sessionId);
            }
        } catch (err) {
            session.autoCollection.lastErrorCode = 'tick_error';
            session.autoCollection.lastErrorMessage = String(err?.message || 'Auto Collection step failed').slice(0, 500);
            await session.save();
        }
    } else if (ENDED.has(session.status)) {
        // If capture batch already succeeded, recover and keep discovering — do not stop on
        // stale bookkeeping / agent ASSISTED_SESSION_FAILED after accepted ingest.
        const accepted = await acceptedSourceAppearances(session);
        const collectionMode = resolveCollectionMode(session.autoCollection || {});
        const target = Number(session.autoCollection?.requestedCaptureTarget || 0);
        const targetMet = collectionMode === 'fixed_target' && target > 0 && accepted >= target;
        const stopReason = String(session.autoCollection?.summary?.stopReason || '');
        const recoverableFail = !targetMet
            && accepted > 0
            && !isOwnerStopped(session)
            && !isPageOutcomeFail(session)
            && (
                session.status === 'failed'
                || stopReason === 'session_failed'
                || stopReason === 'max_safety_pages_reached'
                || ['ASSISTED_SESSION_FAILED', 'EVENT_INGEST_FAILED', 'AGENT_FAILED', ''].includes(String(session.failCode || ''))
            )
            && !['owner_stop', 'capture_target_reached', 'google_no_more_pages', 'all_queries_exhausted'].includes(stopReason);
        const failCode = String(session.failCode || '');
        const failMessage = String(session.failMessage || '').trim();
        const moreQueriesRemain = Number(session.autoCollection?.queriesProcessedTotal || 0) + 1
            < Number(session.autoCollection?.totalApprovedQueries || session.autoCollection?.maxQueries || 1);
        const emptyParserSkip = !targetMet
            && accepted === 0
            && !isOwnerStopped(session)
            && session.status === 'failed'
            && ['UNSUPPORTED_LAYOUT', 'NO_ORGANIC_RESULTS', 'NO_PARSER_RESULTS'].includes(failCode)
            && moreQueriesRemain;
        if (emptyParserSkip) {
            session.status = 'awaiting_user';
            session.failCode = '';
            session.failMessage = '';
            session.failedAt = undefined;
            session.pendingCaptureStatus = 'none';
            session.autoCollection = session.autoCollection || defaultAuto();
            session.autoCollection.discoveryStatus = 'running';
            session.autoCollection.lastErrorCode = failCode || 'no_parser_results';
            session.autoCollection.lastErrorMessage = failMessage || 'No parser results on this page. Continuing to the next query.';
            session.autoCollection.phase = 'complete_query';
            session.autoCollection.status = 'running';
            session.autoCollection.enabled = true;
            session.autoCollection.summary = {
                ...(session.autoCollection.summary || {}),
                stopReason: '',
            };
            await session.save();
            try {
                const outcome = await runPhase(session, user, cid);
                if (outcome?.sessionId && String(outcome.sessionId) !== String(session._id)) {
                    switchedSessionId = String(outcome.sessionId);
                }
            } catch (err) {
                session.autoCollection.lastErrorCode = 'tick_error';
                session.autoCollection.lastErrorMessage = String(err?.message || 'Auto Collection step failed').slice(0, 500);
                await session.save();
            }
        } else if (recoverableFail) {
            session.status = 'awaiting_user';
            session.failCode = '';
            session.failMessage = '';
            session.failedAt = undefined;
            session.pendingCaptureStatus = 'none';
            session.autoCollection = session.autoCollection || defaultAuto();
            session.autoCollection.discoveryStatus = 'running';
            session.autoCollection.lastErrorCode = 'session_recovered_after_accepted_ingest';
            session.autoCollection.lastErrorMessage = 'Recovered after accepted capture; continuing discovery.';
            if (['await_capture', 'done', 'none'].includes(session.autoCollection.phase)) {
                session.autoCollection.phase = 'decide_next';
            }
            session.autoCollection.status = 'running';
            session.autoCollection.enabled = true;
            session.autoCollection.summary = {
                ...(session.autoCollection.summary || {}),
                stopReason: '',
            };
            await session.save();
            try {
                const outcome = await runPhase(session, user, cid);
                if (outcome?.sessionId && String(outcome.sessionId) !== String(session._id)) {
                    switchedSessionId = String(outcome.sessionId);
                }
            } catch (err) {
                session.autoCollection.lastErrorCode = 'tick_error';
                session.autoCollection.lastErrorMessage = String(err?.message || 'Auto Collection step failed').slice(0, 500);
                await session.save();
            }
        } else {
            await finalizeStop(session, { status: 'failed', reason: `session_${session.status}`, user });
        }
    } else {
        const agentStatus = await getAgentStatusForCompany(cid, { sessionId: session._id });
        const clearlyOffline = agentStatus && (agentStatus.online === false || agentStatus.connected === false || agentStatus.agentOnline === false);
        if (isLongAgentOfflinePause(session)) {
            await persistCheckpoint(session);
            await session.save();
        } else if (clearlyOffline) {
            const heartbeatAt = session.lastHeartbeatAt;
            const heartbeatAge = heartbeatAt ? (Date.now() - new Date(heartbeatAt).getTime()) : 0;
            if (heartbeatAge >= LONG_AGENT_OFFLINE_MS) {
                await persistCheckpoint(session);
                await pauseForLongAgentOffline(session);
            } else {
                await waitForAgentReconnect(session, AGENT_OFFLINE_WAIT_MESSAGE);
            }
        } else {
            if (isAgentOfflineWait(session) || session.autoCollection?.pauseReason === 'agent_offline') {
                const started = session.autoCollection?.agentWaitStartedAt;
                const waitedMs = started ? (Date.now() - new Date(started).getTime()) : 0;
                if (waitedMs >= LONG_AGENT_OFFLINE_MS) {
                    await persistCheckpoint(session);
                    await pauseForLongAgentOffline(session);
                } else {
                    clearAgentWait(session);
                    await session.save();
                }
            }
            try {
                const outcome = await runPhase(session, user, cid);
                if (outcome?.sessionId && String(outcome.sessionId) !== String(session._id)) {
                    switchedSessionId = String(outcome.sessionId);
                }
            } catch (err) {
                session.autoCollection.lastErrorCode = 'tick_error';
                session.autoCollection.lastErrorMessage = String(err?.message || 'Auto Collection step failed').slice(0, 500);
                if (Number(err?.statusCode) === 400 && /manual|captcha|consent|Ready/i.test(String(err.message || ''))) {
                    await pauseForManual(session, err.message);
                } else {
                    await session.save();
                }
            }
        }
    }

    await AssistedCaptureSession.updateOne(
        { _id: switchedSessionId || session._id },
        { $set: { 'autoCollection.tickLockUntil': null } },
    );

    const activeId = switchedSessionId || String(session._id);
    const lean = await AssistedCaptureSession.findById(activeId).lean();
    let selectedQuery;
    if (switchedSessionId && lean?.queryId) {
        const { SearchQuery } = await import('../../../../models/searchQuery.model.js');
        const q = await SearchQuery.findById(lean.queryId).select('queryText slsCaptureStatus').lean();
        selectedQuery = { id: String(lean.queryId), queryText: q?.queryText || '', slsCaptureStatus: q?.slsCaptureStatus || 'opening' };
    }
    const campaignProgress = lean
        ? await buildCampaignProgress({ companyId: cid, campaignId: lean.campaignId, session: lean })
        : null;

    return {
        session: sanitizeSession(lean),
        autoCollection: lean ? progressView(lean, campaignProgress) : null,
        campaignProgress,
        sessionId: activeId,
        selectedQuery,
        advanced: true,
        sessionUiLabel: lean ? (SESSION_UI_LABELS[lean.status] || lean.status) : undefined,
    };
}



export async function continueNextBatch({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const session = await loadOwnedSession(cid, sessionId);
    if (isOwnerStopped(session)) {
        throw new ApiError(400, 'STOPPED BY USER. This search will not resume. Start a new search.');
    }
    const ac = session.autoCollection;
    if (!ac || ac.status !== 'paused_batch') {
        throw new ApiError(400, 'No completed batch waiting to continue');
    }
    if (!READY.has(session.status) && session.status !== 'manual_action_required') {
        throw new ApiError(400, `Google must be Ready before continuing the next batch (current: ${session.status})`);
    }
    if (session.status === 'manual_action_required') {
        throw new ApiError(400, 'Manual action required in the Google window. Resolve it, then Continue Auto Collection.');
    }
    const lastPage = Number(ac.lastSuccessfullyCapturedPage || session.googlePageIndex || 0);
    // Continue from last captured page — never reopen page 1
    ac.currentBatch = Number(ac.currentBatch || 1) + 1;
    ac.pagesInCurrentBatch = 0;
    ac.batchStartPage = lastPage + 1;
    ac.batchMessage = '';
    ac.status = 'running';
    ac.enabled = true;
    ac.phase = 'next_page'; // open page after last captured
    ac.nextActionAt = new Date();
    ac.resumeMessage = `Resume Auto Collection from Query ${ac.resumeQueryIndex || 1}, Page ${lastPage}`;
    await session.save();
    const campaignProgress = await buildCampaignProgress({ companyId: cid, campaignId: session.campaignId, session: session.toObject() });
    return {
        session: sanitizeSession(session.toObject()),
        autoCollection: progressView(session.toObject(), campaignProgress),
        campaignProgress,
        message: `Continuing from Google page ${lastPage + 1} (batch ${ac.currentBatch}). Captured records preserved.`,
        preserved: { rawCaptures: true, continueFromPage: lastPage + 1 },
    };
}

export async function resumeAutoCollectionCheckpoint({ companyId, user, sessionId, body = {} }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const session = await loadOwnedSession(cid, sessionId);
    if (isOwnerStopped(session)) {
        throw new ApiError(400, 'STOPPED BY USER. This search will not resume. Start a new search.');
    }
    const ac = session.autoCollection || defaultAuto();
    if (!ac.lastSuccessfullyCapturedPage && !['paused', 'paused_owner', 'paused_manual', 'paused_batch', 'stopped', 'failed', 'running'].includes(ac.status)) {
        throw new ApiError(400, 'No Auto Collection checkpoint to resume');
    }
    if (ENDED.has(session.status)) {
        throw new ApiError(400, 'Session ended. Start a new search, then use Open Next Google Page manually if needed.');
    }
    if (session.status === 'manual_action_required') {
        ac.status = 'paused_manual';
        await session.save();
        throw new ApiError(400, 'Manual action required in the Google window.');
    }
    if (!READY.has(session.status)) {
        throw new ApiError(400, `Wait until Google Ready (current: ${session.status})`);
    }
    const restartQuery = Boolean(body.restartQuery);
    if (restartQuery) {
        // Explicit owner choice only — restart this query from page 1
        ac.pagesCapturedThisQuery = 0;
        ac.pagesInCurrentBatch = 0;
        ac.currentBatch = 1;
        ac.batchStartPage = 1;
        ac.lastSuccessfullyCapturedPage = 0;
        ac.batchMessage = '';
        ac.consecutiveNoNewPages = 0;
        session.googlePageIndex = 1;
        ac.phase = 'delay';
        scheduleDelay(session);
    } else {
        // Resume from last successfully captured page (next action = next page or capture if mid-page)
        ac.phase = Number(ac.pagesInCurrentBatch || 0) > 0 && ac.status === 'paused_batch'
            ? 'next_page'
            : 'delay';
        if (ac.status === 'paused_batch') {
            ac.currentBatch = Number(ac.currentBatch || 1) + 1;
            ac.pagesInCurrentBatch = 0;
            ac.batchStartPage = Number(ac.lastSuccessfullyCapturedPage || 0) + 1;
            ac.batchMessage = '';
            ac.phase = 'next_page';
            ac.nextActionAt = new Date();
        } else {
            scheduleDelay(session);
        }
    }
    ac.status = 'running';
    ac.enabled = true;
    ac.resumeMessage = `Resume Auto Collection from Query ${ac.resumeQueryIndex || 1}, Page ${ac.lastSuccessfullyCapturedPage || session.googlePageIndex || 1}`;
    await session.save();
    const campaignProgress = await buildCampaignProgress({ companyId: cid, campaignId: session.campaignId, session: session.toObject() });
    return {
        session: sanitizeSession(session.toObject()),
        autoCollection: progressView(session.toObject(), campaignProgress),
        campaignProgress,
        message: restartQuery
            ? 'Restarting current query from page 1 (owner confirmed).'
            : (ac.resumeMessage || 'Resuming Auto Collection from last captured page.'),
        preserved: { rawCaptures: true },
    };
}

export async function autoMoveToNextQuery({ companyId, user, sessionId, headers = {} }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const session = await loadOwnedSession(cid, sessionId);
    if (!session.autoCollection || !['paused_batch', 'paused', 'paused_owner', 'running', 'paused_manual'].includes(session.autoCollection.status)) {
        // allow even if idle after batch? require some auto state
    }
    session.autoCollection = session.autoCollection || defaultAuto();
    session.autoCollection.phase = 'complete_query';
    session.autoCollection.status = 'running';
    session.autoCollection.enabled = true;
    session.autoCollection.batchMessage = '';
    await session.save();
    // drive one tick of complete_query -> next_query
    return tickAutoCollection({ companyId: cid, user, sessionId });
}

export async function getAutoCollectionStatus({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureView(user);
    const session = await loadOwnedSession(cid, sessionId);
    const lean = session.toObject();
    const campaignProgress = await buildCampaignProgress({ companyId: cid, campaignId: lean.campaignId, session: lean });
    return {
        session: sanitizeSession(lean),
        autoCollection: progressView(lean, campaignProgress),
        campaignProgress,
    };
}

export { progressView, defaultAuto, readSettings, ACTIVE_AUTO, handleUnsupportedPageOutcome };