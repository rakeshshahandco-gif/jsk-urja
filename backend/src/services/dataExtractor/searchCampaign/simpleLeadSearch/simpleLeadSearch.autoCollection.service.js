/**
 * Simple Lead Search — optional Auto Collection orchestrator.
 * Owner must click Start. Reuses capture / next-page / next-query / continue-after-manual.
 * Never bypasses CAPTCHA. Never creates CRM Leads.
 */
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
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

const ACTIVE_AUTO = ['running', 'paused_owner', 'paused_manual', 'paused_batch'];
const READY = new Set(['awaiting_user', 'ready_to_capture']);
const ENDED = new Set(['completed', 'cancelled', 'expired', 'failed']);

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
        pageCollectionMode: 'until_no_more',
        maxPagesPerQuery: 3, maxQueries: 24, delayMinSec: 20, delayMaxSec: 40,
        pagesPerBatch: 10, maxSafetyPagesPerQuery: 30, pauseAfterEachBatch: true,
        currentBatch: 1, pagesInCurrentBatch: 0, batchStartPage: 1,
        lastSuccessfullyCapturedPage: 0,
        resumeQueryId: null, resumeQueryIndex: 1, resumeMessage: '', batchMessage: '',
        stopAtUnique: 0, stopOnNoNewUniquePages: true,
        autoEnrichAfter: false, autoQualifyAfterEnrich: false, autoVerifyAfterQualify: false,
        nextActionAt: null, tickLockUntil: null,
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
        startedAt: null, stoppedAt: null, startedBy: null, stoppedBy: null,
        rootSessionId: null, campaignId: null,
    };
}
function readSettings(body = {}) {
    const delayMinSec = clampInt(body.delayMinSec ?? 20, 5, 120, 20);
    let delayMaxSec = clampInt(body.delayMaxSec ?? 40, 5, 180, 40);
    if (delayMaxSec < delayMinSec) delayMaxSec = delayMinSec;
    const modeRaw = String(body.pageCollectionMode || body.pageMode || 'until_no_more').toLowerCase();
    const pageCollectionMode = ['fixed', 'batches', 'until_no_more'].includes(modeRaw) ? modeRaw : 'until_no_more';
    const pagesPerBatch = clampInt(body.pagesPerBatch, 1, 10, 10);
    const maxSafetyPagesPerQuery = clampInt(body.maxSafetyPagesPerQuery, 10, 50, 30);
    return {
        pageCollectionMode,
        maxPagesPerQuery: clampInt(body.maxPagesPerQuery, 1, 10, 3),
        pagesPerBatch,
        maxSafetyPagesPerQuery,
        pauseAfterEachBatch: !(body.pauseAfterEachBatch === false || body.pauseAfterEachBatch === 'false' || body.pauseAfterEachBatch === 0),
        maxQueries: clampInt(body.maxQueries ?? body.maxGeneratedQueries, 1, 24, 24),
        delayMinSec, delayMaxSec,
        stopAtUnique: clampInt(body.stopAtUnique ?? body.stopWhenUniqueReach ?? 0, 0, 100000, 0),
        stopOnNoNewUniquePages: pageCollectionMode === 'until_no_more'
            ? true
            : !(body.stopOnNoNewUniquePages === false || body.stopOnNoNewUniquePages === 'false' || body.stopOnNoNewUniquePages === 0),
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
        paused_owner: 'Auto Collection Paused',
        paused_batch: 'Batch completed — waiting for owner to continue',
        completed: 'Auto Collection Completed',
        stopped: 'Auto Collection Stopped',
        failed: 'Auto Collection Failed',
        idle: 'Auto Collection Idle',
    };
    return {
        enabled: Boolean(ac.enabled),
        status: ac.status || 'idle',
        phase: ac.phase || 'none',
        settings: {
            pageCollectionMode: ac.pageCollectionMode || 'fixed',
            maxPagesPerQuery: ac.maxPagesPerQuery, maxQueries: ac.maxQueries,
            pagesPerBatch: ac.pagesPerBatch || 10,
            maxSafetyPagesPerQuery: ac.maxSafetyPagesPerQuery || 30,
            pauseAfterEachBatch: ac.pauseAfterEachBatch !== false,
            delayMinSec: ac.delayMinSec, delayMaxSec: ac.delayMaxSec,
            stopAtUnique: ac.stopAtUnique, stopOnNoNewUniquePages: ac.stopOnNoNewUniquePages,
            autoEnrichAfter: ac.autoEnrichAfter, autoQualifyAfterEnrich: ac.autoQualifyAfterEnrich,
            autoVerifyAfterQualify: ac.autoVerifyAfterQualify,
        },
        pageCollectionMode: ac.pageCollectionMode || 'fixed',
        currentBatch: Number(ac.currentBatch || 1),
        pagesInCurrentBatch: Number(ac.pagesInCurrentBatch || 0),
        pagesPerBatch: Number(ac.pagesPerBatch || 10),
        maxSafetyPagesPerQuery: Number(ac.maxSafetyPagesPerQuery || 30),
        lastSuccessfullyCapturedPage: Number(ac.lastSuccessfullyCapturedPage || 0),
        batchMessage: ac.batchMessage || '',
        resumeMessage: ac.resumeMessage || '',
        canContinueBatch: ac.status === 'paused_batch',
        canResumeCheckpoint: ['paused_owner', 'paused_manual', 'paused_batch', 'stopped', 'failed'].includes(ac.status)
            && Number(ac.lastSuccessfullyCapturedPage || 0) > 0,
        queryIndex: campaignProgress?.queryIndex || 1,
        queryTotal: Math.min(Number(ac.maxQueries || 3), campaignProgress?.queryTotal || Number(ac.maxQueries || 3)),
        businessType: campaignProgress?.currentBusinessType || '',
        locationLabel: campaignProgress?.currentLocationLabel || '',
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
        manualActionRequired: session.status === 'manual_action_required' || ac.status === 'paused_manual',
        uiLabel: labelMap[ac.status] || 'Auto Collection Idle',
    };
}
async function loadOwnedSession(companyId, sessionId) {
    requireObjectId(sessionId, 'Assisted capture session');
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId });
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    return session;
}
async function finalizeStop(session, { status, reason, user }) {
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
export async function stopCompanyAutoCollection({ companyId, user, reason = 'new_search_started' }) {
    const cid = requireCompanyId(companyId);
    const now = new Date();
    const res = await AssistedCaptureSession.updateMany(
        { companyId: cid, 'autoCollection.status': { $in: ACTIVE_AUTO } },
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

async function maybeFinishLimits(session, user) {
    const ac = session.autoCollection;
    const unique = await campaignUnique(session.companyId, session.campaignId);
    const mode = ac.pageCollectionMode || 'fixed';
    const pagesThisQ = Number(ac.pagesCapturedThisQuery || 0);
    const safety = Number(ac.maxSafetyPagesPerQuery || 30);

    if (ac.stopAtUnique > 0 && unique >= ac.stopAtUnique) {
        await finalizeStop(session, { status: 'completed', reason: 'unique_target_reached', user });
        return true;
    }
    if (ac.stopOnNoNewUniquePages && Number(ac.consecutiveNoNewPages || 0) >= 2) {
        await finalizeStop(session, { status: 'completed', reason: 'no_new_unique_consecutive_pages', user });
        return true;
    }
    if ((mode === 'batches' || mode === 'until_no_more') && pagesThisQ >= safety) {
        await finalizeStop(session, { status: 'completed', reason: 'max_safety_pages_reached', user });
        return true;
    }
    return false;
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
        await finalizeStop(session, { status: 'completed', reason: 'collection_complete_pipeline_active', user });
        return;
    }
    if (!ac.autoEnrichAfter) {
        await finalizeStop(session, { status: 'completed', reason: 'collection_complete', user });
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
    session.autoCollection.nextActionAt = null;
    session.autoCollection.lastErrorCode = 'manual_action_required';
    session.autoCollection.lastErrorMessage = String(message || 'Manual action required in the Google window.').slice(0, 500);
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
    session.autoCollection = {
        ...base, ...settings, enabled: true,
        status: pausedManual ? 'paused_manual' : 'running',
        phase: pausedManual ? 'none' : 'delay',
        uniqueAtStart: unique, startedAt: new Date(), startedBy: actorId(user),
        currentBatch: 1, pagesInCurrentBatch: 0, batchStartPage: Number(session.googlePageIndex || 1),
        lastSuccessfullyCapturedPage: 0, batchMessage: '',
        resumeQueryId: session.queryId, resumeQueryIndex: 1,
        resumeMessage: '',
        pagesPerBatch: settings.pagesPerBatch, maxSafetyPagesPerQuery: settings.maxSafetyPagesPerQuery,
        pauseAfterEachBatch: settings.pauseAfterEachBatch, pageCollectionMode: settings.pageCollectionMode,
        rootSessionId: session._id, campaignId: session.campaignId,
        nextActionAt: pausedManual ? null : new Date(Date.now() + randomDelayMs(settings.delayMinSec, settings.delayMaxSec)),
        summary: { ...base.summary },
    };
    await session.save();
    const campaignProgress = await buildCampaignProgress({ companyId: cid, campaignId: session.campaignId, session: session.toObject() });
    return {
        session: sanitizeSession(session.toObject()),
        autoCollection: progressView(session.toObject(), campaignProgress),
        campaignProgress,
        message: pausedManual
            ? 'Manual action required in the Google window. Resolve it, then click Continue Auto Collection.'
            : 'Auto Collection started. It will capture pages and advance queries within your limits. CAPTCHA/consent pause for you.',
    };
}

export async function pauseAutoCollection({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const session = await loadOwnedSession(cid, sessionId);
    if ((session.autoCollection?.status || 'idle') !== 'running') throw new ApiError(400, 'Auto Collection is not running');
    session.autoCollection.status = 'paused_owner';
    session.autoCollection.nextActionAt = null;
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
    if (st === 'paused_manual') throw new ApiError(400, 'Resolve the Google window issue first, then click Continue Auto Collection.');
    if (st !== 'paused_owner') throw new ApiError(400, 'Auto Collection is not paused');
    if (session.status === 'manual_action_required') {
        session.autoCollection.status = 'paused_manual';
        await session.save();
        throw new ApiError(400, 'Manual action required in the Google window.');
    }
    session.autoCollection.status = 'running';
    session.autoCollection.enabled = true;
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
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const session = await loadOwnedSession(cid, sessionId);
    if (!session.autoCollection || session.autoCollection.status === 'idle') {
        const campaignProgress = await buildCampaignProgress({ companyId: cid, campaignId: session.campaignId, session: session.toObject() });
        return {
            session: sanitizeSession(session.toObject()),
            autoCollection: progressView(session.toObject(), campaignProgress),
            campaignProgress,
            message: 'Auto Collection was not active. Existing captures remain saved.',
        };
    }
    await finalizeStop(session, { status: 'stopped', reason, user });
    const campaignProgress = await buildCampaignProgress({ companyId: cid, campaignId: session.campaignId, session: session.toObject() });
    return {
        session: sanitizeSession(session.toObject()),
        autoCollection: progressView(session.toObject(), campaignProgress),
        campaignProgress,
        message: 'Auto Collection stopped. All completed captures remain saved.',
        preserved: { rawCaptures: true },
    };
}

export async function continueAutoCollectionAfterManual({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const { continueSimpleLeadSearchAfterManual } = await import('./simpleLeadSearch.service.js');
    await continueSimpleLeadSearchAfterManual({ companyId: cid, user, sessionId });
    const session = await loadOwnedSession(cid, sessionId);
    if (session.status === 'manual_action_required') {
        throw new ApiError(400, 'Google is still not Ready. Finish CAPTCHA/consent in the managed browser, then try again.');
    }
    if (!READY.has(session.status)) throw new ApiError(400, `Wait until Google Ready (current: ${session.status})`);
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
async function runPhase(session, user, cid) {
    const ac = session.autoCollection;
    const now = Date.now();

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
        ac.uniqueBeforeLastCapture = await campaignUnique(cid, session.campaignId);
        ac.captureEventsAtLastRequest = Number(session.captureEventCount || 0);
        ac.insertedAtLastRequest = Number(session.insertedCount || 0);
        ac.updatedAtLastRequest = Number(session.updatedExistingCount || 0);
        await session.save();
        await requestCaptureVisibleResults({
            companyId: cid, user, campaignId: session.campaignId, queryId: session.queryId, sessionId: session._id,
            body: { idempotencyKey: `sls-auto-${session._id}-${Date.now()}` },
        });
        const fresh = await AssistedCaptureSession.findById(session._id);
        fresh.autoCollection.phase = 'await_capture';
        await fresh.save();
        return { reload: true };
    }

    if (ac.phase === 'await_capture') {
        const pending = session.pendingCaptureStatus || 'none';
        const events = Number(session.captureEventCount || 0);
        const baseline = Number(ac.captureEventsAtLastRequest || 0);
        if (['pending', 'acked'].includes(pending) || session.status === 'capturing') {
            await session.save();
            return {};
        }
        if (events <= baseline && !READY.has(session.status)) {
            await session.save();
            return {};
        }
        const uniqueAfter = await campaignUnique(cid, session.campaignId);
        const newUnique = Math.max(0, uniqueAfter - Number(ac.uniqueBeforeLastCapture || 0));
        const insertedDelta = Math.max(0, Number(session.insertedCount || 0) - Number(ac.insertedAtLastRequest || 0));
        const updatedDelta = Math.max(0, Number(session.updatedExistingCount || 0) - Number(ac.updatedAtLastRequest || 0));
        ac.lastPageVisible = Number(session.visibleResultCount || 0);
        ac.lastPageNewUnique = newUnique || insertedDelta;
        ac.lastPageUpdated = updatedDelta;
        ac.pagesCapturedThisQuery = Number(ac.pagesCapturedThisQuery || 0) + 1;
        ac.pagesProcessedTotal = Number(ac.pagesProcessedTotal || 0) + 1;
        ac.pagesInCurrentBatch = Number(ac.pagesInCurrentBatch || 0) + 1;
        ac.lastSuccessfullyCapturedPage = Number(session.googlePageIndex || ac.pagesCapturedThisQuery);
        if (!ac.batchStartPage) ac.batchStartPage = Number(session.googlePageIndex || 1);
        if (!ac.currentBatch) ac.currentBatch = 1;
        ac.consecutiveNoNewPages = ((newUnique || insertedDelta) <= 0)
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

        if (await maybeFinishLimits(session, user)) return { reload: true };

        const mode = ac.pageCollectionMode || 'fixed';
        const pagesThisQ = Number(ac.pagesCapturedThisQuery || 0);
        const pagesInBatch = Number(ac.pagesInCurrentBatch || 0);
        const pagesPerBatch = Number(ac.pagesPerBatch || 10);
        const fixedLimit = Number(ac.maxPagesPerQuery || 3);
        const safety = Number(ac.maxSafetyPagesPerQuery || 30);

        if (mode === 'fixed') {
            if (pagesThisQ >= fixedLimit) {
                ac.phase = 'complete_query';
                await session.save();
                return runPhase(session, user, cid);
            }
        } else if (mode === 'batches') {
            if (pagesThisQ >= safety) {
                await finalizeStop(session, { status: 'completed', reason: 'max_safety_pages_reached', user });
                return { reload: true };
            }
            if (pagesInBatch >= pagesPerBatch) {
                if (ac.pauseAfterEachBatch !== false) {
                    const startP = Number(ac.batchStartPage || 1);
                    const endP = Number(ac.lastSuccessfullyCapturedPage || pagesThisQ);
                    const uniqueNow = await campaignUnique(cid, session.campaignId);
                    ac.status = 'paused_batch';
                    ac.phase = 'await_batch_continue';
                    ac.enabled = true;
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
        } else if (mode === 'until_no_more') {
            if (pagesThisQ >= safety) {
                await finalizeStop(session, { status: 'completed', reason: 'max_safety_pages_reached', user });
                return { reload: true };
            }
        }

        ac.phase = 'next_page';
        await session.save();
        return runPhase(session, user, cid);
    }

    if (ac.phase === 'next_page') {
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
        const fresh = await AssistedCaptureSession.findById(session._id);
        fresh.autoCollection.phase = 'await_nav';
        await fresh.save();
        return { reload: true };
    }

    if (ac.phase === 'complete_query') {
        await markQueryComplete({ companyId: cid, user, sessionId: session._id });
        ac.queriesProcessedTotal = Number(ac.queriesProcessedTotal || 0) + 1;
        if (Number(ac.queriesProcessedTotal || 0) >= Number(ac.maxQueries || 3)) {
            await startPostCollectionJobs(session, user);
            return { reload: true };
        }
        ac.phase = 'next_query';
        await session.save();
        return runPhase(session, user, cid);
    }

    if (ac.phase === 'next_query') {
        const snapshot = session.toObject();
        let next;
        try {
            next = await openNextGeneratedQuery({ companyId: cid, user, sessionId: session._id, headers: {} });
        } catch (err) {
            if (Number(err?.statusCode) === 400) {
                await startPostCollectionJobs(session, user);
                return { reload: true };
            }
            throw err;
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
            pagesCapturedThisQuery: 0, pagesInCurrentBatch: 0, currentBatch: 1, batchStartPage: 1, lastSuccessfullyCapturedPage: 0, batchMessage: '', consecutiveNoNewPages: 0, nextActionAt: null, tickLockUntil: null,
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

    let session = await AssistedCaptureSession.findOneAndUpdate(
        {
            _id: sessionId, companyId: cid, 'autoCollection.status': 'running',
            $or: [
                { 'autoCollection.tickLockUntil': null },
                { 'autoCollection.tickLockUntil': { $lte: new Date() } },
                { 'autoCollection.tickLockUntil': { $exists: false } },
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
        await pauseForManual(session, session.manualActionMessage || 'Manual action required in the Google window.');
    } else if (ENDED.has(session.status)) {
        await finalizeStop(session, { status: 'failed', reason: `session_${session.status}`, user });
    } else {
        const agentStatus = await getAgentStatusForCompany(cid, { sessionId: session._id });
        const clearlyOffline = agentStatus && (agentStatus.online === false || agentStatus.connected === false || agentStatus.agentOnline === false);
        if (clearlyOffline) {
            await finalizeStop(session, { status: 'failed', reason: 'agent_offline', user });
        } else {
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
    const ac = session.autoCollection || defaultAuto();
    if (!ac.lastSuccessfullyCapturedPage && !['paused_owner', 'paused_manual', 'paused_batch', 'stopped', 'failed', 'running'].includes(ac.status)) {
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
    if (!session.autoCollection || !['paused_batch', 'paused_owner', 'running', 'paused_manual'].includes(session.autoCollection.status)) {
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

export { progressView, defaultAuto, readSettings, ACTIVE_AUTO };