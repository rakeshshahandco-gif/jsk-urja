/**
 * Continuous Automatic Processing pipeline: CP6 → CP7 → CP8 after capture.
 * Owner-enabled (default OFF). Never creates CRM Leads. No CAPTCHA bypass.
 */
import mongoose from 'mongoose';
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { RawCaptureEnrichment, RawCaptureEnrichmentJob } from '../../../../models/rawCaptureEnrichment.model.js';
import { RawCaptureQualification, RawCaptureQualificationJob } from '../../../../models/rawCaptureQualification.model.js';
import { RawCaptureGenuineness, RawCaptureGenuinenessJob } from '../../../../models/rawCaptureGenuineness.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { assertAssistedCaptureStart, assertAssistedCaptureView } from '../assistedCapture/permissions.util.js';

const PROCESSED_IDS_CAP = 5000;
const TICK_LOCK_MS = 2500;
const ACTIVE_JOB = ['queued', 'processing'];
const ENRICH_DONE = ['completed', 'partial', 'review_required'];
const QUALIFY_ELIGIBLE = ['strong_match', 'possible_match', 'human_review_required'];
const TEMP_ERROR_RE = /timeout|temporar|econnreset|econnrefused|etimedout|rate.?limit|429|502|503|504|socket hang up/i;
const PERM_ERROR_RE = /404|not found|login.?required|blocked|robots|unsupported directory|invalid url|disallow/i;

function requireCompanyId(companyId) {
    if (!companyId || !mongoose.isValidObjectId(companyId)) {
        throw new ApiError(400, 'Company context required');
    }
    return companyId;
}

function requireObjectId(id, label) {
    if (!id || !mongoose.isValidObjectId(id)) throw new ApiError(404, `${label} not found`);
}

function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
}

function parseBool(raw, fallback = false) {
    if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
    if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
    return fallback;
}

function actorId(user) {
    return user?._id || user?.id || null;
}

function defaultAutoProcessing() {
    return {
        enabled: false,
        ownerWorkflowEnabled: false,
        status: 'idle',
        batchSize: 10,
        autoEnrich: true,
        autoQualify: true,
        autoVerify: true,
        continueWhileCollecting: true,
        retryTemporaryFailures: true,
        maxRetryAttempts: 2,
        autoCreateCrmLeads: false,
        autoResumeNotice: false,
        currentStage: 'idle',
        currentBatchNumber: 0,
        currentBatchCaptureIds: [],
        currentBatchEnrichmentIds: [],
        currentBatchQualificationIds: [],
        currentEnrichJobId: null,
        currentQualifyJobId: null,
        currentVerifyJobId: null,
        processedCaptureIdKeys: [],
        flushRequested: false,
        stopCaptureOnly: false,
        tickLockUntil: null,
        lastTickAt: null,
        lastProcessedAt: null,
        retryCount: 0,
        lastErrorCode: '',
        lastErrorMessage: '',
        counts: {
            capturedUnique: 0,
            waitingEnrichment: 0,
            enriching: 0,
            enriched: 0,
            noWebsite: 0,
            enrichmentFailed: 0,
            waitingQualification: 0,
            qualified: 0,
            rejected: 0,
            waitingVerification: 0,
            verified: 0,
            verificationFailed: 0,
            reviewRequired: 0,
            failed: 0,
            processingBacklog: 0,
            batchesCompleted: 0,
            reconcileWaiting: 0,
            reconcileProcessing: 0,
            reconcileCompleted: 0,
            reconcileReviewRequired: 0,
            reconcileRejectedSkipped: 0,
            reconcileFailed: 0,
            stageEnrichmentDocs: 0,
            stageQualificationDocs: 0,
            stageGenuinenessDocs: 0,
        },
        lastBatchStartedAt: null,
        lastBatchCompletedAt: null,
        nextRetryAt: null,
        startedAt: null,
        stoppedAt: null,
        startedBy: null,
        stoppedBy: null,
        rootSessionId: null,
        campaignId: null,
    };
}

export function readAutoProcessingSettings(body = {}) {
    return {
        batchSize: clampInt(body.batchSize ?? body.processBatchAfterUnique ?? 10, 1, 100, 10),
        autoEnrich: parseBool(body.autoEnrich ?? body.autoEnrichment, true),
        autoQualify: parseBool(body.autoQualify ?? body.autoQualification, true),
        autoVerify: parseBool(body.autoVerify ?? body.autoGenuinenessVerification, true),
        continueWhileCollecting: parseBool(body.continueWhileCollecting, true),
        retryTemporaryFailures: parseBool(body.retryTemporaryFailures, true),
        maxRetryAttempts: clampInt(body.maxRetryAttempts, 0, 5, 2),
        autoCreateCrmLeads: false, // permanently OFF
    };
}

async function loadOwnedSession(companyId, sessionId) {
    requireObjectId(sessionId, 'Assisted capture session');
    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId });
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    return session;
}

function ensureAp(session) {
    if (!session.autoProcessing || typeof session.autoProcessing !== 'object') {
        session.autoProcessing = defaultAutoProcessing();
    }
    if (!session.autoProcessing.counts) {
        session.autoProcessing.counts = defaultAutoProcessing().counts;
    }
    if (!Array.isArray(session.autoProcessing.processedCaptureIdKeys)) {
        session.autoProcessing.processedCaptureIdKeys = [];
    }
    // Never allow lead creation flag
    session.autoProcessing.autoCreateCrmLeads = false;
    return session.autoProcessing;
}

function markProcessed(ap, ids) {
    const set = new Set(ap.processedCaptureIdKeys || []);
    for (const id of ids) set.add(String(id));
    ap.processedCaptureIdKeys = [...set].slice(-PROCESSED_IDS_CAP);
}

const PENDING_ENRICH_STATUSES = [
    { enrichmentStatus: { $exists: false } },
    { enrichmentStatus: null },
    { enrichmentStatus: '' },
    { enrichmentStatus: 'not_started' },
    { enrichmentStatus: 'pending' },
];

function pendingEnrichmentFilter(companyId, campaignId, extra = {}) {
    return {
        companyId,
        campaignId,
        $or: PENDING_ENRICH_STATUSES,
        ...extra,
    };
}

const NO_WEBSITE_RE = /no website|no usable website|directory|missing.?url|empty.?url/i;
const REJECTED_QUAL = ['rejected', 'rejected_unusable', 'not_relevant'];

function isPendingEnrichStatus(status) {
    return status == null || status === '' || status === 'not_started' || status === 'pending';
}

/**
 * Mutually exclusive per-capture buckets. Sum always equals capturedUnique.
 * Stage doc counts are reported separately (may overlap / not equal captures).
 */
async function computeReconcileAndStageMetrics(companyId, campaignId) {
    const [captures, enrichDocs, qualDocs, genDocs] = await Promise.all([
        RawCapture.find({ companyId, campaignId }).select('_id enrichmentStatus enrichmentBlockedReason').lean(),
        RawCaptureEnrichment.find({ companyId, campaignId }).select('_id rawCaptureIds enrichmentStatus').lean(),
        RawCaptureQualification.find({ companyId, campaignId }).select('_id enrichmentId systemDecision').lean(),
        RawCaptureGenuineness.find({ companyId, campaignId })
            .select('_id qualificationId genuinenessDecision verificationStatus').lean(),
    ]);

    const enrichByCapture = new Map();
    for (const e of enrichDocs) {
        for (const cid of (e.rawCaptureIds || [])) {
            const key = String(cid);
            if (!enrichByCapture.has(key)) enrichByCapture.set(key, e);
        }
    }
    const qualByEnrichment = new Map(qualDocs.map((q) => [String(q.enrichmentId), q]));
    const genByQual = new Map(genDocs.map((g) => [String(g.qualificationId), g]));

    let reconcileWaiting = 0;
    let reconcileProcessing = 0;
    let reconcileCompleted = 0;
    let reconcileReviewRequired = 0;
    let reconcileRejectedSkipped = 0;
    let reconcileFailed = 0;

    for (const cap of captures) {
        const st = cap.enrichmentStatus;
        const reason = String(cap.enrichmentBlockedReason || '');
        const enrich = enrichByCapture.get(String(cap._id));
        const qual = enrich ? qualByEnrichment.get(String(enrich._id)) : null;
        const gen = qual ? genByQual.get(String(qual._id)) : null;

        if (isPendingEnrichStatus(st)) {
            reconcileWaiting += 1;
            continue;
        }
        if (st === 'processing') {
            reconcileProcessing += 1;
            continue;
        }
        if (gen) {
            if (gen.genuinenessDecision === 'human_review_required') {
                reconcileReviewRequired += 1;
                continue;
            }
            if (gen.verificationStatus === 'failed') {
                reconcileFailed += 1;
                continue;
            }
            reconcileCompleted += 1;
            continue;
        }
        if (qual && REJECTED_QUAL.includes(qual.systemDecision)) {
            reconcileRejectedSkipped += 1;
            continue;
        }
        if (st === 'failed' || st === 'blocked') {
            if (NO_WEBSITE_RE.test(reason) || /directory/i.test(reason)) {
                reconcileRejectedSkipped += 1;
            } else {
                reconcileFailed += 1;
            }
            continue;
        }
        // Enrichment done (or exists) but still in CP7/CP8 queue
        if (enrich && ENRICH_DONE.includes(enrich.enrichmentStatus) && (!qual || QUALIFY_ELIGIBLE.includes(qual.systemDecision))) {
            reconcileProcessing += 1;
            continue;
        }
        if (enrich && ENRICH_DONE.includes(enrich.enrichmentStatus)) {
            reconcileProcessing += 1;
            continue;
        }
        reconcileWaiting += 1;
    }

    return {
        reconcileWaiting,
        reconcileProcessing,
        reconcileCompleted,
        reconcileReviewRequired,
        reconcileRejectedSkipped,
        reconcileFailed,
        stageEnrichmentDocs: enrichDocs.length,
        stageQualificationDocs: qualDocs.length,
        stageGenuinenessDocs: genDocs.length,
    };
}

async function refreshCounts(session) {
    const ap = ensureAp(session);
    const companyId = session.companyId;
    const campaignId = session.campaignId;

    const [
        capturedUnique,
        waitingEnrichment,
        enriching,
        enrichedDocs,
        enrichFailed,
        noWebsite,
        qualifiedDocs,
        verifiedDocs,
        reviewRequired,
        failedG,
        rejected,
        reconcile,
    ] = await Promise.all([
        RawCapture.countDocuments({ companyId, campaignId }),
        RawCapture.countDocuments(pendingEnrichmentFilter(companyId, campaignId)),
        RawCapture.countDocuments({ companyId, campaignId, enrichmentStatus: 'processing' }),
        RawCaptureEnrichment.find({
            companyId,
            campaignId,
            enrichmentStatus: { $in: ENRICH_DONE },
        }).select('_id').lean(),
        RawCapture.countDocuments({ companyId, campaignId, enrichmentStatus: { $in: ['failed', 'blocked'] } }),
        RawCapture.countDocuments({
            companyId,
            campaignId,
            enrichmentStatus: { $in: ['failed', 'blocked'] },
            enrichmentBlockedReason: { $regex: /no website|no usable website|directory|missing.?url|empty.?url/i },
        }),
        RawCaptureQualification.find({ companyId, campaignId }).select('_id enrichmentId systemDecision').lean(),
        RawCaptureGenuineness.find({ companyId, campaignId }).select('_id qualificationId genuinenessDecision verificationStatus').lean(),
        RawCaptureGenuineness.countDocuments({
            companyId,
            campaignId,
            genuinenessDecision: 'human_review_required',
        }),
        RawCaptureGenuineness.countDocuments({
            companyId,
            campaignId,
            verificationStatus: 'failed',
        }),
        RawCaptureQualification.countDocuments({
            companyId,
            campaignId,
            systemDecision: { $in: REJECTED_QUAL },
        }),
        computeReconcileAndStageMetrics(companyId, campaignId),
    ]);

    const qualifiedEnrichmentIds = new Set(qualifiedDocs.map((q) => String(q.enrichmentId)));
    const waitingQualification = enrichedDocs.filter((e) => !qualifiedEnrichmentIds.has(String(e._id))).length;

    const verifiedQualIds = new Set(verifiedDocs.map((v) => String(v.qualificationId)));
    const waitingVerification = qualifiedDocs.filter((q) =>
        QUALIFY_ELIGIBLE.includes(q.systemDecision) && !verifiedQualIds.has(String(q._id))).length;

    const verified = verifiedDocs.filter((v) => v.verificationStatus !== 'failed').length;
    const processingBacklog = waitingEnrichment + enriching + waitingQualification + waitingVerification;

    ap.counts = {
        capturedUnique,
        waitingEnrichment,
        enriching,
        enriched: enrichedDocs.length,
        noWebsite,
        enrichmentFailed: enrichFailed,
        waitingQualification,
        qualified: qualifiedDocs.filter((q) => QUALIFY_ELIGIBLE.includes(q.systemDecision)).length,
        rejected,
        waitingVerification,
        verified,
        verificationFailed: failedG,
        reviewRequired,
        failed: enrichFailed + failedG,
        processingBacklog,
        batchesCompleted: Number(ap.counts?.batchesCompleted || 0),
        ...reconcile,
    };
    return ap.counts;
}

function isExplicitOwnerHalt(ap) {
    return ap.status === 'paused_owner' || ap.status === 'stopped';
}

/**
 * Owner one-click / enable workflow remains active until Stop All.
 * Legacy: startedAt without stop still counts (handoff bugs left enabled:false + idle).
 */
export function isOwnerWorkflowActive(ap) {
    if (!ap) return false;
    if (ap.status === 'stopped') return false;
    if (ap.ownerWorkflowEnabled === true) return true;
    if (ap.enabled === true) return true;
    if (ap.startedAt) return true;
    return false;
}

/**
 * Auto-resume idle/completed/failed pipelines when backlog remains.
 * Never overrides Pause or Stop All. Never creates CRM leads.
 */
export async function ensureAutoResumeBacklog(session, ap) {
    await refreshCounts(session);
    const backlog = Number(ap.counts?.processingBacklog || 0);
    if (backlog <= 0) {
        if (ap.autoResumeNotice) ap.autoResumeNotice = false;
        return { resumed: false, backlog: 0 };
    }
    if (isExplicitOwnerHalt(ap)) {
        return { resumed: false, backlog, halted: true };
    }
    if (!isOwnerWorkflowActive(ap)) {
        return { resumed: false, backlog, workflowOff: true };
    }
    if (ap.status === 'running' && ap.enabled) {
        return { resumed: false, backlog, alreadyRunning: true };
    }

    // idle / completed / failed / enabled lost while workflow still intended
    ap.enabled = true;
    ap.ownerWorkflowEnabled = true;
    ap.status = 'running';
    ap.currentStage = (ap.currentStage === 'done' || ap.currentStage === 'idle' || !ap.currentStage)
        ? 'waiting_batch'
        : ap.currentStage;
    ap.autoResumeNotice = true;
    ap.lastErrorCode = 'pipeline_auto_resumed_backlog';
    ap.lastErrorMessage = 'Pending records detected. Automatic processing resumed.';
    ap.stoppedAt = null;
    ap.stoppedBy = null;
    if (!ap.startedAt) ap.startedAt = new Date();
    await repairStaleProcessedQueue(session, ap);
    return { resumed: true, backlog };
}

export function progressView(session) {
    const ap = session?.autoProcessing || defaultAutoProcessing();
    const c = ap.counts || {};
    const capturedUnique = Number(c.capturedUnique || 0);
    const processingBacklog = Number(c.processingBacklog || 0)
        || (Number(c.waitingEnrichment || 0) + Number(c.enriching || 0)
            + Number(c.waitingQualification || 0) + Number(c.waitingVerification || 0));

    // Never present Completed while backlog remains
    let status = ap.status || 'idle';
    if (processingBacklog > 0 && status === 'completed') status = 'running';

    const labelMap = {
        idle: 'Automatic Processing Idle',
        running: 'Automatic Processing Running',
        paused_owner: 'Automatic Processing Paused',
        stopped: 'Automatic Processing Stopped',
        completed: 'Automatic Processing Completed',
        failed: 'Automatic Processing Failed',
    };
    const autoResumed = Boolean(ap.autoResumeNotice)
        || ap.lastErrorCode === 'pipeline_auto_resumed_backlog'
        || ap.lastErrorCode === 'pipeline_resumed_backlog';

    const reconcileWaiting = Number(c.reconcileWaiting || 0);
    const reconcileProcessing = Number(c.reconcileProcessing || 0);
    const reconcileCompleted = Number(c.reconcileCompleted || 0);
    const reconcileReviewRequired = Number(c.reconcileReviewRequired || 0);
    const reconcileRejectedSkipped = Number(c.reconcileRejectedSkipped || 0);
    const reconcileFailed = Number(c.reconcileFailed || 0);
    const reconcileTotal = reconcileWaiting + reconcileProcessing + reconcileCompleted
        + reconcileReviewRequired + reconcileRejectedSkipped + reconcileFailed;

    return {
        enabled: Boolean(ap.enabled),
        ownerWorkflowEnabled: Boolean(ap.ownerWorkflowEnabled || ap.enabled || ap.startedAt),
        status,
        uiLabel: labelMap[status] || 'Automatic Processing',
        currentStage: ap.currentStage || 'idle',
        batchSize: Number(ap.batchSize || 10),
        autoEnrich: ap.autoEnrich !== false,
        autoQualify: ap.autoQualify !== false,
        autoVerify: ap.autoVerify !== false,
        continueWhileCollecting: ap.continueWhileCollecting !== false,
        retryTemporaryFailures: ap.retryTemporaryFailures !== false,
        maxRetryAttempts: Number(ap.maxRetryAttempts ?? 2),
        autoCreateCrmLeads: false,
        currentBatchNumber: Number(ap.currentBatchNumber || 0),
        currentBatchSize: Array.isArray(ap.currentBatchCaptureIds) ? ap.currentBatchCaptureIds.length : 0,
        flushRequested: Boolean(ap.flushRequested),
        stopCaptureOnly: Boolean(ap.stopCaptureOnly),
        lastErrorCode: ap.lastErrorCode || '',
        lastErrorMessage: ap.lastErrorMessage || '',
        autoResumed,
        autoResumeMessage: autoResumed
            ? 'Pending records detected. Automatic processing resumed.'
            : '',
        retryCount: Number(ap.retryCount || 0),
        lastProcessedAt: ap.lastProcessedAt || null,
        lastBatchStartedAt: ap.lastBatchStartedAt || null,
        lastBatchCompletedAt: ap.lastBatchCompletedAt || null,
        nextRetryAt: ap.nextRetryAt || null,
        lastTickAt: ap.lastTickAt || null,
        counts: {
            capturedUnique,
            waitingEnrichment: c.waitingEnrichment || 0,
            enriching: c.enriching || 0,
            enriched: c.enriched || 0,
            noWebsite: c.noWebsite || 0,
            enrichmentFailed: c.enrichmentFailed || 0,
            waitingQualification: c.waitingQualification || 0,
            qualified: c.qualified || 0,
            rejected: c.rejected || 0,
            waitingVerification: c.waitingVerification || 0,
            verified: c.verified || 0,
            verificationFailed: c.verificationFailed || 0,
            reviewRequired: c.reviewRequired || 0,
            failed: c.failed || 0,
            processingBacklog,
            batchesCompleted: c.batchesCompleted || 0,
            reconcileWaiting,
            reconcileProcessing,
            reconcileCompleted,
            reconcileReviewRequired,
            reconcileRejectedSkipped,
            reconcileFailed,
            reconcileTotal,
            stageEnrichmentDocs: Number(c.stageEnrichmentDocs || 0),
            stageQualificationDocs: Number(c.stageQualificationDocs || 0),
            stageGenuinenessDocs: Number(c.stageGenuinenessDocs || 0),
        },
        backlogSummary: capturedUnique
            ? `${capturedUnique} captured. ${processingBacklog} waiting for processing.`
            : '',
        note: 'CRM Lead creation remains permanently OFF for automatic processing.',
    };
}

/**
 * Root-cause fix: never scan only the oldest N pending rows and skip them via
 * processedCaptureIdKeys in memory. That starved later batches once ~50 captures
 * were marked processed while still enrichmentStatus=pending.
 * Exclude processed/in-flight IDs in Mongo ($nin) so the next eligible batch is found.
 */
async function findNextBatchCaptureIds(session, ap) {
    const processed = (ap.processedCaptureIdKeys || []).map(String);
    const inFlight = (ap.currentBatchCaptureIds || []).map(String);
    const exclude = [...new Set([...processed, ...inFlight])]
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));

    const filter = pendingEnrichmentFilter(session.companyId, session.campaignId);
    if (ap.retryTemporaryFailures) {
        filter.$or = [
            ...PENDING_ENRICH_STATUSES,
            { enrichmentStatus: 'failed' },
        ];
    }
    if (exclude.length) filter._id = { $nin: exclude };

    const batchSize = Number(ap.batchSize || 10);
    const captures = await RawCapture.find(filter)
        .sort({ firstSeenAt: 1, createdAt: 1 })
        .select('_id enrichmentStatus enrichmentBlockedReason')
        .limit(Math.max(batchSize * 3, 30))
        .lean();

    const out = [];
    for (const c of captures) {
        if (c.enrichmentStatus === 'failed') {
            const reason = String(c.enrichmentBlockedReason || '');
            if (PERM_ERROR_RE.test(reason)) continue;
            // Cap retries via processed keys after max attempts tracked on capture reason
            if (/retry.?exhausted|max.?retry/i.test(reason)) continue;
        }
        out.push(c._id);
        if (out.length >= batchSize) break;
    }
    return out;
}

/**
 * Re-queue captures that were marked processed but never left the pending pool
 * (starvation victims from the old limit+skip bug). Safe for live campaigns.
 */
async function repairStaleProcessedQueue(session, ap) {
    const keys = (ap.processedCaptureIdKeys || []).filter((id) => mongoose.isValidObjectId(id));
    if (!keys.length) return 0;
    const objectIds = keys.map((id) => new mongoose.Types.ObjectId(id));
    const stillPending = await RawCapture.find({
        companyId: session.companyId,
        campaignId: session.campaignId,
        _id: { $in: objectIds },
        $or: PENDING_ENRICH_STATUSES,
    }).select('_id').lean();
    if (!stillPending.length) return 0;
    const stuck = new Set(stillPending.map((d) => String(d._id)));
    ap.processedCaptureIdKeys = (ap.processedCaptureIdKeys || []).filter((k) => !stuck.has(String(k)));
    if (!ap.lastErrorMessage) {
        ap.lastErrorMessage = `Re-queued ${stuck.size} waiting captures that were incorrectly marked processed.`;
        ap.lastErrorCode = 'queue_repair';
    }
    return stuck.size;
}

async function finalizeUnresolvedCaptures(companyId, campaignId, captureIds) {
    if (!captureIds?.length) return;
    await RawCapture.updateMany(
        {
            companyId,
            campaignId,
            _id: { $in: captureIds },
            $or: PENDING_ENRICH_STATUSES.concat([{ enrichmentStatus: 'processing' }]),
        },
        {
            $set: {
                enrichmentStatus: 'failed',
                enrichmentBlockedReason: 'No enrichment result produced for this capture (no usable website or enrichment skipped).',
            },
        },
    );
}

async function enrichmentIdsForCaptures(companyId, campaignId, captureIds) {
    if (!captureIds.length) return [];
    const docs = await RawCaptureEnrichment.find({
        companyId,
        campaignId,
        rawCaptureIds: { $in: captureIds },
        enrichmentStatus: { $in: ENRICH_DONE },
    }).select('_id').lean();
    return docs.map((d) => d._id);
}

async function unprocessedEnrichmentIds(companyId, campaignId, enrichmentIds) {
    if (!enrichmentIds.length) return [];
    const existing = await RawCaptureQualification.find({
        companyId,
        campaignId,
        enrichmentId: { $in: enrichmentIds },
    }).select('enrichmentId').lean();
    const done = new Set(existing.map((e) => String(e.enrichmentId)));
    return enrichmentIds.filter((id) => !done.has(String(id)));
}

async function eligibleQualificationIds(companyId, campaignId, enrichmentIds) {
    if (!enrichmentIds.length) return [];
    const quals = await RawCaptureQualification.find({
        companyId,
        campaignId,
        enrichmentId: { $in: enrichmentIds },
        systemDecision: { $in: QUALIFY_ELIGIBLE },
    }).select('_id').lean();

    const qualIds = quals.map((q) => q._id);
    if (!qualIds.length) return [];

    const existing = await RawCaptureGenuineness.find({
        companyId,
        campaignId,
        qualificationId: { $in: qualIds },
    }).select('qualificationId').lean();
    const done = new Set(existing.map((e) => String(e.qualificationId)));
    return qualIds.filter((id) => !done.has(String(id)));
}

function isJobTerminal(status) {
    return ['completed', 'partial', 'failed', 'stopped'].includes(String(status || ''));
}

function isJobActive(status) {
    return ACTIVE_JOB.includes(String(status || ''));
}

/** Recover from worker crash / backend restart leaving jobs stuck in queued|processing */
function isStaleActiveJob(job, maxAgeMs = 90_000) {
    if (!job || !isJobActive(job.status)) return false;
    const t = new Date(job.updatedAt || job.startedAt || job.createdAt || 0).getTime();
    if (!Number.isFinite(t) || t <= 0) return true;
    return (Date.now() - t) > maxAgeMs;
}

async function loadJobStatus(Model, id) {
    if (!id) return null;
    return Model.findById(id).lean();
}

export async function enableAutoProcessing({ companyId, user, sessionId, body = {} }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const session = await loadOwnedSession(cid, sessionId);
    const settings = readAutoProcessingSettings(body);
    const ap = ensureAp(session);

    // One active pipeline per company: pause others
    await AssistedCaptureSession.updateMany(
        {
            companyId: cid,
            _id: { $ne: session._id },
            'autoProcessing.status': 'running',
        },
        {
            $set: {
                'autoProcessing.status': 'paused_owner',
                'autoProcessing.lastErrorMessage': 'Paused because another session enabled automatic processing.',
            },
        },
    );

    Object.assign(ap, settings, {
        enabled: true,
        ownerWorkflowEnabled: true,
        status: 'running',
        currentStage: 'waiting_batch',
        autoCreateCrmLeads: false,
        autoResumeNotice: false,
        flushRequested: false,
        stopCaptureOnly: false,
        lastErrorCode: '',
        lastErrorMessage: '',
        retryCount: 0,
        startedAt: ap.startedAt || new Date(),
        startedBy: actorId(user),
        stoppedAt: null,
        stoppedBy: null,
        rootSessionId: ap.rootSessionId || session._id,
        campaignId: session.campaignId,
    });

    await repairStaleProcessedQueue(session, ap);
    await refreshCounts(session);
    await session.save();
    return { autoProcessing: progressView(session.toObject()) };
}

export async function pauseAutoProcessing({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const session = await loadOwnedSession(cid, sessionId);
    const ap = ensureAp(session);
    if (!ap.enabled && ap.status === 'idle') {
        throw new ApiError(400, 'Automatic processing is not active');
    }
    ap.status = 'paused_owner';
    ap.lastErrorMessage = 'Paused by owner. Current stage job may finish; no new jobs will start.';
    await session.save();
    return { autoProcessing: progressView(session.toObject()) };
}

export async function resumeAutoProcessing({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const session = await loadOwnedSession(cid, sessionId);
    const ap = ensureAp(session);
    if (!ap.enabled) {
        throw new ApiError(400, 'Enable automatic processing first');
    }
    ap.status = 'running';
    ap.currentStage = ap.currentStage === 'done' ? 'waiting_batch' : (ap.currentStage || 'waiting_batch');
    ap.lastErrorCode = '';
    ap.lastErrorMessage = '';
    ap.flushRequested = true; // flush leftovers after resume
    await repairStaleProcessedQueue(session, ap);
    await session.save();
    return { autoProcessing: progressView(session.toObject()) };
}

export async function stopAutoProcessing({ companyId, user, sessionId, body = {} }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const session = await loadOwnedSession(cid, sessionId);
    const ap = ensureAp(session);
    const stopJobs = parseBool(body.stopJobs, true);

    ap.status = 'stopped';
    ap.currentStage = 'done';
    ap.enabled = false;
    ap.ownerWorkflowEnabled = false;
    ap.autoResumeNotice = false;
    ap.stoppedAt = new Date();
    ap.stoppedBy = actorId(user);
    ap.flushRequested = false;
    ap.lastErrorMessage = 'Stopped by owner. Completed work is preserved.';

    if (stopJobs) {
        try {
            const { stopEnrichmentJob } = await import('../rawCaptureEnrichment/rawCaptureEnrichment.service.js');
            await stopEnrichmentJob({ companyId: cid, user, sessionId });
        } catch { /* soft */ }
        try {
            const { stopQualificationJob } = await import('../rawCaptureQualification/rawCaptureQualification.service.js');
            await stopQualificationJob({ companyId: cid, user, sessionId });
        } catch { /* soft */ }
        try {
            const { stopVerificationJob } = await import('../rawCaptureGenuineness/rawCaptureGenuineness.service.js');
            await stopVerificationJob({ companyId: cid, user, sessionId });
        } catch { /* soft */ }
    }

    await refreshCounts(session);
    await session.save();
    return { autoProcessing: progressView(session.toObject()) };
}

export async function requestFlushAutoProcessing({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureStart(user);
    const session = await loadOwnedSession(cid, sessionId);
    const ap = ensureAp(session);
    if (ap.enabled && ap.status === 'running') {
        ap.flushRequested = true;
        await session.save();
    }
    return { autoProcessing: progressView(session.toObject()) };
}

export async function getAutoProcessingStatus({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureView(user);
    const session = await loadOwnedSession(cid, sessionId);
    ensureAp(session);
    await refreshCounts(session);
    await session.save();
    return { autoProcessing: progressView(session.toObject()) };
}

async function startEnrichBatch(session, user, ap) {
    const ids = await findNextBatchCaptureIds(session, ap);
    if (!ids.length) {
        ap.currentStage = 'waiting_batch';
        ap.currentBatchCaptureIds = [];
        return { started: false, reason: 'no_pending' };
    }

    const collecting = session.autoCollection?.status === 'running';
    if (collecting && !ap.continueWhileCollecting && !ap.flushRequested) {
        return { started: false, reason: 'waiting_collection' };
    }

    const needFullBatch = !ap.flushRequested && collecting;
    if (needFullBatch && ids.length < Number(ap.batchSize || 10)) {
        ap.currentStage = 'waiting_batch';
        return { started: false, reason: 'waiting_full_batch', pending: ids.length };
    }

    if (!ap.autoEnrich) {
        await finalizeUnresolvedCaptures(session.companyId, session.campaignId, ids);
        markProcessed(ap, ids);
        ap.currentStage = 'waiting_batch';
        return { started: false, reason: 'enrich_disabled' };
    }

    const { startEnrichmentJob } = await import('../rawCaptureEnrichment/rawCaptureEnrichment.service.js');
    const result = await startEnrichmentJob({
        companyId: session.companyId,
        user,
        sessionId: String(session._id),
        mode: 'selected',
        rawCaptureIds: ids,
    });

    if (result.alreadyRunning) {
        ap.currentStage = 'enriching';
        ap.currentEnrichJobId = result.job?._id || ap.currentEnrichJobId;
        return { started: false, reason: 'already_running' };
    }

    ap.currentBatchNumber = Number(ap.currentBatchNumber || 0) + 1;
    ap.currentBatchCaptureIds = ids;
    ap.currentBatchEnrichmentIds = [];
    ap.currentBatchQualificationIds = [];
    ap.currentEnrichJobId = result.job._id;
    ap.currentQualifyJobId = null;
    ap.currentVerifyJobId = null;
    ap.currentStage = 'enriching';
    ap.lastBatchStartedAt = new Date();
    ap.retryCount = 0;
    ap.lastErrorCode = '';
    ap.lastErrorMessage = '';
    return { started: true, batchSize: ids.length };
}

async function advanceAfterEnrich(session, user, ap, enrichJob) {
    if (isJobActive(enrichJob?.status)) {
        if (isStaleActiveJob(enrichJob)) {
            ap.currentEnrichJobId = null;
            ap.currentStage = 'waiting_batch';
            ap.lastErrorCode = 'stale_enrich_job_cleared';
            ap.lastErrorMessage = 'Pending records detected. Automatic processing resumed.';
            ap.autoResumeNotice = true;
            return;
        }
        ap.currentStage = 'enriching';
        return;
    }

    if (!isJobTerminal(enrichJob?.status)) {
        // Job missing — clear and retry later
        ap.currentEnrichJobId = null;
        ap.currentStage = 'waiting_batch';
        return;
    }

    if (enrichJob.status === 'failed' && ap.retryTemporaryFailures
        && TEMP_ERROR_RE.test(String(enrichJob.lastError || ''))
        && Number(ap.retryCount || 0) < Number(ap.maxRetryAttempts || 2)) {
        ap.retryCount = Number(ap.retryCount || 0) + 1;
        ap.currentEnrichJobId = null;
        ap.currentStage = 'waiting_batch';
        ap.lastErrorCode = 'enrich_retry';
        ap.lastErrorMessage = String(enrichJob.lastError || 'Enrichment failed; will retry').slice(0, 500);
        // do not mark processed so batch can retry
        return;
    }

    const captureIds = ap.currentBatchCaptureIds || [];
    await finalizeUnresolvedCaptures(session.companyId, session.campaignId, captureIds);
    const enrichIds = await enrichmentIdsForCaptures(session.companyId, session.campaignId, captureIds);
    ap.currentBatchEnrichmentIds = enrichIds;
    markProcessed(ap, captureIds);
    ap.lastProcessedAt = new Date();
    ap.currentEnrichJobId = null;

    if (!ap.autoQualify || !enrichIds.length) {
        ap.counts.batchesCompleted = Number(ap.counts.batchesCompleted || 0) + 1;
        ap.lastBatchCompletedAt = new Date();
        ap.currentBatchCaptureIds = [];
        ap.currentStage = 'waiting_batch';
        return;
    }

    const toQualify = await unprocessedEnrichmentIds(session.companyId, session.campaignId, enrichIds);
    if (!toQualify.length) {
        ap.counts.batchesCompleted = Number(ap.counts.batchesCompleted || 0) + 1;
        ap.lastBatchCompletedAt = new Date();
        ap.currentBatchCaptureIds = [];
        ap.currentStage = 'waiting_batch';
        return;
    }

    const { startQualificationJob } = await import('../rawCaptureQualification/rawCaptureQualification.service.js');
    const result = await startQualificationJob({
        companyId: session.companyId,
        user,
        sessionId: String(session._id),
        mode: 'selected',
        enrichmentIds: toQualify,
    });
    ap.currentQualifyJobId = result.job?._id || null;
    ap.currentStage = 'qualifying';
    ap.retryCount = 0;
}

async function advanceAfterQualify(session, user, ap, qualifyJob) {
    if (isJobActive(qualifyJob?.status)) {
        if (isStaleActiveJob(qualifyJob)) {
            ap.currentQualifyJobId = null;
            ap.currentStage = 'waiting_batch';
            ap.lastErrorCode = 'stale_qualify_job_cleared';
            ap.lastErrorMessage = 'Pending records detected. Automatic processing resumed.';
            ap.autoResumeNotice = true;
            return;
        }
        ap.currentStage = 'qualifying';
        return;
    }
    if (!isJobTerminal(qualifyJob?.status)) {
        ap.currentQualifyJobId = null;
        ap.currentStage = 'waiting_batch';
        return;
    }

    if (qualifyJob.status === 'failed' && ap.retryTemporaryFailures
        && TEMP_ERROR_RE.test(String(qualifyJob.lastError || ''))
        && Number(ap.retryCount || 0) < Number(ap.maxRetryAttempts || 2)) {
        ap.retryCount = Number(ap.retryCount || 0) + 1;
        ap.currentQualifyJobId = null;
        ap.lastErrorCode = 'qualify_retry';
        ap.lastErrorMessage = String(qualifyJob.lastError || 'Qualification failed; will retry').slice(0, 500);
        // re-queue same enrichments
        const { startQualificationJob } = await import('../rawCaptureQualification/rawCaptureQualification.service.js');
        const result = await startQualificationJob({
            companyId: session.companyId,
            user,
            sessionId: String(session._id),
            mode: 'selected',
            enrichmentIds: ap.currentBatchEnrichmentIds || [],
        });
        ap.currentQualifyJobId = result.job?._id || null;
        ap.currentStage = 'qualifying';
        return;
    }

    ap.currentQualifyJobId = null;
    const enrichIds = ap.currentBatchEnrichmentIds || [];

    if (!ap.autoVerify) {
        ap.counts.batchesCompleted = Number(ap.counts.batchesCompleted || 0) + 1;
        ap.lastBatchCompletedAt = new Date();
        ap.currentBatchCaptureIds = [];
        ap.currentBatchEnrichmentIds = [];
        ap.currentStage = 'waiting_batch';
        return;
    }

    const qualIds = await eligibleQualificationIds(session.companyId, session.campaignId, enrichIds);
    ap.currentBatchQualificationIds = qualIds;
    if (!qualIds.length) {
        ap.counts.batchesCompleted = Number(ap.counts.batchesCompleted || 0) + 1;
        ap.lastBatchCompletedAt = new Date();
        ap.currentBatchCaptureIds = [];
        ap.currentBatchEnrichmentIds = [];
        ap.currentStage = 'waiting_batch';
        return;
    }

    const { startVerificationJob } = await import('../rawCaptureGenuineness/rawCaptureGenuineness.service.js');
    const result = await startVerificationJob({
        companyId: session.companyId,
        user,
        sessionId: String(session._id),
        mode: 'selected',
        qualificationIds: qualIds,
    });
    ap.currentVerifyJobId = result.job?._id || null;
    ap.currentStage = 'verifying';
    ap.retryCount = 0;
}

async function advanceAfterVerify(session, ap, verifyJob) {
    if (isJobActive(verifyJob?.status)) {
        if (isStaleActiveJob(verifyJob)) {
            ap.currentVerifyJobId = null;
            ap.currentStage = 'waiting_batch';
            ap.lastErrorCode = 'stale_verify_job_cleared';
            ap.lastErrorMessage = 'Pending records detected. Automatic processing resumed.';
            ap.autoResumeNotice = true;
            return;
        }
        ap.currentStage = 'verifying';
        return;
    }
    if (!isJobTerminal(verifyJob?.status)) {
        ap.currentVerifyJobId = null;
        ap.currentStage = 'waiting_batch';
        return;
    }

    ap.currentVerifyJobId = null;
    ap.counts.batchesCompleted = Number(ap.counts.batchesCompleted || 0) + 1;
    ap.lastBatchCompletedAt = new Date();
    ap.currentBatchCaptureIds = [];
    ap.currentBatchEnrichmentIds = [];
    ap.currentBatchQualificationIds = [];
    ap.lastProcessedAt = new Date();
    ap.currentStage = 'waiting_batch';
}

/**
 * Advance one pipeline step. Safe to call frequently from UI poll / auto-collection tick.
 * Auto-resumes idle/completed/failed when backlog > 0 and owner workflow is active.
 * Respects Pause (paused_owner) and Stop All (stopped).
 */
export async function tickAutoProcessing({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    assertAssistedCaptureView(user);
    const session = await loadOwnedSession(cid, sessionId);
    const ap = ensureAp(session);

    const resumeInfo = await ensureAutoResumeBacklog(session, ap);

    if (isExplicitOwnerHalt(ap) || !ap.enabled || ap.status !== 'running') {
        await refreshCounts(session);
        await session.save();
        return {
            autoProcessing: progressView(session.toObject()),
            advanced: false,
            autoResumed: Boolean(resumeInfo?.resumed),
        };
    }

    const now = Date.now();
    if (ap.tickLockUntil && new Date(ap.tickLockUntil).getTime() > now) {
        return {
            autoProcessing: progressView(session.toObject()),
            advanced: false,
            locked: true,
            autoResumed: Boolean(resumeInfo?.resumed),
        };
    }
    ap.tickLockUntil = new Date(now + TICK_LOCK_MS);
    ap.lastTickAt = new Date();

    try {
        await refreshCounts(session);

        if (ap.currentStage === 'enriching' || ap.currentEnrichJobId) {
            const job = await loadJobStatus(RawCaptureEnrichmentJob, ap.currentEnrichJobId);
            await advanceAfterEnrich(session, user, ap, job);
        } else if (ap.currentStage === 'qualifying' || ap.currentQualifyJobId) {
            const job = await loadJobStatus(RawCaptureQualificationJob, ap.currentQualifyJobId);
            await advanceAfterQualify(session, user, ap, job);
        } else if (ap.currentStage === 'verifying' || ap.currentVerifyJobId) {
            const job = await loadJobStatus(RawCaptureGenuinenessJob, ap.currentVerifyJobId);
            await advanceAfterVerify(session, ap, job);
        } else {
            // waiting_batch / idle / flushing — start next enrich batch if ready
            await repairStaleProcessedQueue(session, ap);
            const collecting = session.autoCollection?.status === 'running';
            if (!collecting) ap.flushRequested = true;
            await startEnrichBatch(session, user, ap);

            // If nothing pending and not collecting → completed (only when backlog truly empty)
            const pending = await findNextBatchCaptureIds(session, ap);
            await refreshCounts(session);
            const backlogLeft = Number(ap.counts?.processingBacklog || 0);
            if (!pending.length && !ap.currentEnrichJobId && !ap.currentQualifyJobId && !ap.currentVerifyJobId
                && !collecting
                && backlogLeft <= 0
                && !['enriching', 'qualifying', 'verifying'].includes(ap.currentStage)) {
                ap.currentStage = 'done';
                ap.status = 'completed';
                ap.flushRequested = false;
                ap.autoResumeNotice = false;
            } else if (backlogLeft > 0 && ap.status === 'completed') {
                ap.status = 'running';
                ap.currentStage = 'waiting_batch';
            }
        }

        await refreshCounts(session);
        await session.save();
        return {
            autoProcessing: progressView(session.toObject()),
            advanced: true,
            autoResumed: Boolean(resumeInfo?.resumed),
        };
    } catch (err) {
        ap.lastErrorCode = 'pipeline_tick_failed';
        ap.lastErrorMessage = String(err?.message || err).slice(0, 500);
        // Do not permanently kill pipeline on transient tick errors
        if (!TEMP_ERROR_RE.test(ap.lastErrorMessage)) {
            // keep running; owner can pause
        }
        await session.save();
        return {
            autoProcessing: progressView(session.toObject()),
            advanced: false,
            error: ap.lastErrorMessage,
            autoResumed: Boolean(resumeInfo?.resumed),
        };
    }
}

/**
 * Called when Google capture stops — flush remaining records below batch size.
 */
export async function onCaptureStoppedFlush({ companyId, user, sessionId }) {
    const cid = requireCompanyId(companyId);
    const session = await loadOwnedSession(cid, sessionId);
    const ap = ensureAp(session);
    // Soft flush + auto-resume when workflow active (not Pause/Stop)
    await ensureAutoResumeBacklog(session, ap);
    if (ap.enabled && (ap.status === 'running' || ap.status === 'paused_owner')) {
        ap.flushRequested = true;
        ap.stopCaptureOnly = true;
        await session.save();
        if (ap.status === 'running') {
            return tickAutoProcessing({ companyId: cid, user, sessionId });
        }
    } else {
        await session.save();
    }
    return { autoProcessing: progressView(session.toObject()) };
}
