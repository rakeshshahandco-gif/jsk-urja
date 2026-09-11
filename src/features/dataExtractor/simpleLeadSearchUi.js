/**
 * Null-safe helpers for Simple Lead Search owner UI.
 * Keep pure (no React) so node:test can cover render-data edge cases.
 */

export function formatBusinessTypesLabel(businessType = '') {
    if (Array.isArray(businessType)) {
        return businessType.map((s) => String(s || '').trim()).filter(Boolean).join(' + ');
    }
    return String(businessType || '').trim();
}

export function formatSimpleSearchLabel(product = '', businessType = '', location = '') {
    return [product, formatBusinessTypesLabel(businessType), location]
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .join(' · ');
}

export function nextSimpleBusinessTypes(current = [], toggledId = '') {
    const ANY = 'Any Business';
    const id = String(toggledId || '').trim();
    const list = Array.isArray(current) ? current.filter(Boolean) : [];
    if (!id) return list.length ? list : ['Manufacturer'];
    if (id === ANY) return [ANY];
    const withoutAny = list.filter((x) => x !== ANY);
    const has = withoutAny.includes(id);
    if (has) {
        const next = withoutAny.filter((x) => x !== id);
        return next.length ? next : withoutAny;
    }
    return [...withoutAny, id];
}

export function formatBusinessTypeField(record = {}, arrayKey = 'requestedBusinessTypes', singularKey = 'requestedBusinessType') {
    const arr = record?.[arrayKey];
    if (Array.isArray(arr) && arr.length) return arr.join(', ');
    return String(record?.[singularKey] || '').trim() || '-';
}

/**
 * Resolve generated-query list for display without assuming campaign/result exist.
 * @param {object|null|undefined} campaignProgress
 * @param {object|null|undefined} result
 * @returns {array}
 */
export function safeGeneratedQueries(campaignProgress, result) {
    const fromProgress = campaignProgress?.queries;
    if (Array.isArray(fromProgress)) return fromProgress;
    const fromResult = result?.queries;
    if (Array.isArray(fromResult)) return fromResult;
    return [];
}

/**
 * @param {object|null|undefined} campaignProgress
 * @param {object|null|undefined} result
 * @param {object|null|undefined} autoCollection
 * @returns {number}
 */
export function safeQueryTotal(campaignProgress, result, autoCollection) {
    const total =
        campaignProgress?.queryTotal
        ?? result?.campaignProgress?.queryTotal
        ?? (Array.isArray(result?.queries) ? result.queries.length : null)
        ?? autoCollection?.queryTotal
        ?? 0;
    return Number(total) || 0;
}

const SAFE_FAIL_REASON = Object.freeze({
    UNSUPPORTED_LAYOUT: 'No parser results on this page',
    NO_ORGANIC_RESULTS: 'No organic results extracted',
    NO_PARSER_RESULTS: 'No parser results',
    AGENT_FAILED: 'Discovery Agent reported a failure',
    AGENT_OFFLINE: 'Agent offline',
    EVENT_INGEST_FAILED: 'Ingest rejected records',
    ASSISTED_SESSION_FAILED: 'Discovery session failed',
    session_failed: 'Discovery session failed',
    capture_ingest_failed: 'Capture ingest failed',
    agent_offline: 'Agent offline',
});

export const AGENT_OFFLINE_WAIT_MESSAGE = 'Discovery Agent temporarily offline — extraction will resume automatically when the agent reconnects.';
export const DISCOVERY_AGENT_OFFLINE = 'DISCOVERY_AGENT_OFFLINE';
export const OWNER_PAUSE = 'OWNER_PAUSE';
export const AGENT_SLEEP_PAUSE_MESSAGE =
    'Discovery Agent is offline. Your progress is saved. When the computer/agent is available again, click Resume Campaign to continue from the saved position.';

export function isLongAgentOfflinePause(autoCollection = {}) {
    const ac = autoCollection || {};
    return String(ac.pauseReason || '') === DISCOVERY_AGENT_OFFLINE
        || String(ac.lastErrorCode || '') === DISCOVERY_AGENT_OFFLINE
        || String(ac.discoveryDisplayStatus || '') === 'paused_agent_offline';
}

export function isOwnerManualPause(autoCollection = {}) {
    const reason = String(autoCollection?.pauseReason || '');
    return reason === OWNER_PAUSE || reason === 'owner_pause';
}

/** Temporary Discovery Agent disconnect — waiting, not a terminal pause/failure. */
export function isWaitingForDiscoveryAgent(autoCollection = {}) {
    const ac = autoCollection || {};
    if (isLongAgentOfflinePause(ac)) return false;
    const waitingFlag = String(ac.pauseReason || '') === 'agent_offline'
        || String(ac.discoveryStatus || '') === 'waiting_for_agent';
    if (!waitingFlag) return false;
    const st = String(ac.status || '');
    return st === 'running' || st === 'paused_owner' || st === 'paused';
}

export function campaignHasUnfinishedDiscovery(autoCollection = {}, campaignProgress = null) {
    const pending = Number(autoCollection?.pendingQueries);
    if (Number.isFinite(pending) && pending > 0) return true;
    const qi = Number(autoCollection?.queryIndex || autoCollection?.lastQueryIndex || campaignProgress?.queryIndex || 1);
    const qt = Number(autoCollection?.queryTotal || autoCollection?.totalApprovedQueries || campaignProgress?.queryTotal || 0);
    const completed = Number(autoCollection?.queriesCompleted || 0);
    if (qt > 0 && qi < qt) return true;
    if (qt > 0 && completed < qt) return true;
    return false;
}

export function isAuthoritativeCollectionComplete(autoCollection = {}, session = {}, campaignProgress = null) {
    if (isOwnerStoppedSearch(session, autoCollection)) return false;
    if (isLongAgentOfflinePause(autoCollection) || isWaitingForDiscoveryAgent(autoCollection)) return false;
    if (campaignHasUnfinishedDiscovery(autoCollection, campaignProgress)) return false;
    const reason = String(autoCollection?.summary?.stopReason || '');
    return ['all_queries_exhausted', 'google_no_more_pages', 'capture_target_reached', 'collection_complete'].includes(reason)
        && String(autoCollection?.status || '') === 'completed';
}

/**
 * Failed runs must never show a blank Last Processing Error.
 * Discovery failures live on autoCollection / session, not autoProcessing.
 */
export function isOwnerStoppedSearch(session, autoCollection) {
    const ac = autoCollection || session?.autoCollection || {};
    return Boolean(ac.ownerStoppedAt)
        || ac.stopRequested === true
        || String(ac.summary?.stopReason || '') === 'owner_stop'
        || String(session?.status || '') === 'cancelled';
}

export function isOwnerStopCopy(text) {
    return /stopped by (owner|user)|already stopped|STOPPED BY USER/i.test(String(text || ''));
}

export function isAlreadyStoppedMessage(text) {
    return /already stopped|STOPPED BY USER|will not resume/i.test(String(text || ''));
}

export function alreadyStoppedUserMessage() {
    return 'Search is already stopped.';
}

export function allProcessingAlreadyStoppedMessage() {
    return 'All processing is already stopped.';
}

export function searchStoppedSuccessMessage() {
    return 'Search stopped successfully. Collected results have been preserved.';
}

export function lastVisibleRunError({ autoProcessing, autoCollection, session, status } = {}) {
    if (isWaitingForDiscoveryAgent(autoCollection) || isLongAgentOfflinePause(autoCollection)) return '';
    if (
        isOwnerStoppedSearch(session, autoCollection)
        || String(autoProcessing?.lastErrorCode || '') === 'owner_stop'
        || String(autoCollection?.lastErrorCode || '') === 'owner_stop'
    ) {
        return '';
    }
    const candidates = [
        autoProcessing?.lastErrorMessage,
        autoCollection?.lastErrorMessage,
        session?.failMessage,
        session?.safeFailureMessage,
        session?.manualActionMessage,
        autoCollection?.pauseReason,
    ].map((s) => String(s || '').trim()).filter((s) => s && !isOwnerStopCopy(s) && !isBrowserRequestTimeoutMessage(s));
    if (candidates[0]) return candidates[0];
    const failed = ['failed', 'FAILED'].includes(String(status || ''))
        || String(autoCollection?.status || '') === 'failed'
        || String(session?.status || '') === 'failed'
        || String(autoCollection?.discoveryStatus || '') === 'failed';
    if (!failed) return '';
    const code = String(
        session?.failCode || autoCollection?.lastErrorCode || autoProcessing?.lastErrorCode || '',
    ).trim();
    if (code && SAFE_FAIL_REASON[code]) return SAFE_FAIL_REASON[code];
    if (code) return code.replace(/_/g, ' ');
    return 'Run failed without a stored reason.';
}

/**
 * @param {object|null|undefined} campaignProgress
 * @param {object|null|undefined} result
 * @param {object|null|undefined} autoCollection
 * @returns {number}
 */
export function safeQueryIndex(campaignProgress, result, autoCollection) {
    const idx =
        campaignProgress?.queryIndex
        ?? result?.campaignProgress?.queryIndex
        ?? autoCollection?.queryIndex
        ?? 1;
    return Number(idx) || 1;
}

/**
 * Owner-facing load failure copy (no stack traces).
 */
export const CAMPAIGN_LOAD_ERROR_MESSAGE =
    'Unable to load the previous campaign. You can start a new search or retry.';

export const AUTO_RESUME_BACKLOG_MESSAGE =
    'Pending records detected. Automatic processing resumed.';

/**
 * Keep status polling alive when capture session is inactive but CP6→CP8 backlog remains.
 * Do not keep polling a terminal session merely because full-auto is checked.
 * @param {object|null|undefined} autoProcessing
 * @param {boolean} ownerFullAuto
 */
export function shouldKeepPollingForAutoProcessing(autoProcessing, ownerFullAuto = true) {
    if (!autoProcessing) return false;
    const status = autoProcessing.status || 'idle';
    if (status === 'paused_owner' || status === 'stopped') return false;
    const backlog = Number(autoProcessing.counts?.processingBacklog || 0);
    if (backlog > 0) return true;
    if (status === 'running') return true;
    if (autoProcessing.enabled || autoProcessing.ownerWorkflowEnabled) return true;
    return Boolean(ownerFullAuto && status === 'completed' && backlog > 0);
}

/**
 * Mutually exclusive reconcile buckets from autoProcessing.counts.
 * @param {object|null|undefined} counts
 */
export function formatQueryProgressLabel({
    queriesCompleted = 0,
    queryIndex = 1,
    queryTotal = 0,
    googlePage = 1,
} = {}) {
    const current = Number(queryIndex) || 1;
    const total = Number(queryTotal) || 0;
    const completed = Number(queriesCompleted) || 0;
    const page = Number(googlePage) || 1;
    const totalLabel = total || '—';
    return `${completed} completed · Query ${current}/${totalLabel} — Page ${page}`;
}

export function pendingQueryCount({ queryIndex = 1, queryTotal = 0 } = {}) {
    return Math.max(0, (Number(queryTotal) || 0) - (Number(queryIndex) || 1));
}

export function formatProviderState(autoCollection = {}, session = {}) {
    const explicit = String(autoCollection?.providerState || '').trim();
    if (explicit) return explicit;
    if (isLongAgentOfflinePause(autoCollection) || isWaitingForDiscoveryAgent(autoCollection)) {
        return 'Provider temporarily unavailable';
    }
    if (session?.status === 'manual_action_required' || autoCollection?.status === 'paused_manual') {
        return 'Human Verification';
    }
    if (autoCollection?.pauseReason === 'unsupported_page_retry' || autoCollection?.lastErrorCode === 'unsupported_page_retry') {
        return 'Retry';
    }
    if (autoCollection?.status === 'running') return 'Running';
    if (autoCollection?.discoveryStatus === 'no_more_results') return 'Exhausted';
    return '';
}

export function formatDiscoveryOwnerStatus(autoCollection = {}, session = {}) {
    if (isLongAgentOfflinePause(autoCollection)) {
        return 'paused_agent_offline';
    }
    if (isWaitingForDiscoveryAgent(autoCollection)) {
        return 'waiting_for_agent';
    }
    const provider = formatProviderState(autoCollection, session);
    if (provider === 'Retry' || autoCollection?.pauseReason === 'unsupported_page_retry') {
        return 'Waiting on provider / retrying';
    }
    if (provider === 'Human Verification') return 'Human verification required';
    if (provider === 'Provider temporarily unavailable') return 'Provider temporarily unavailable';
    return String(autoCollection?.discoveryDisplayStatus || autoCollection?.discoveryStatus || autoCollection?.status || 'idle');
}

export function reconcileBucketsFromCounts(counts = {}) {
    const waiting = Number(counts.reconcileWaiting || 0);
    const processing = Number(counts.reconcileProcessing || 0);
    const completed = Number(counts.reconcileCompleted || 0);
    const reviewRequired = Number(counts.reconcileReviewRequired || 0);
    const rejectedSkipped = Number(counts.reconcileRejectedSkipped || 0);
    const failed = Number(counts.reconcileFailed || 0);
    const total = waiting + processing + completed + reviewRequired + rejectedSkipped + failed;
    return {
        waiting,
        processing,
        completed,
        reviewRequired,
        rejectedSkipped,
        failed,
        total,
        stageEnrichmentDocs: Number(counts.stageEnrichmentDocs || 0),
        stageQualificationDocs: Number(counts.stageQualificationDocs || 0),
        stageGenuinenessDocs: Number(counts.stageGenuinenessDocs || 0),
    };
}

/**
 * Axios/browser HTTP timeout — not a campaign failure and not a Playwright timeout.
 * Axios message shape: "timeout of 120000ms exceeded"
 */
export const BROWSER_REQUEST_TIMEOUT_MESSAGE =
    'The browser request timed out. The campaign is still running in the background — status will keep updating.';

export function isBrowserRequestTimeoutMessage(text = '') {
    return /timeout of \d+ms exceeded/i.test(String(text || ''));
}

export function isBrowserRequestTimeout(err) {
    const code = String(err?.code || '');
    const msg = String(err?.response?.data?.message || err?.message || '');
    return code === 'ECONNABORTED' || isBrowserRequestTimeoutMessage(msg);
}

/** Browser HTTP timeout must not end, restart, or fail the campaign. */
export function isFatalBrowserTimeoutForCampaign(err) {
    return isBrowserRequestTimeout(err) ? false : null;
}

/**
 * After Start/Resume HTTP ack (or a timed-out ack), keep the same campaign identity.
 * Long Google/CP6–CP8 work continues via backend ticker + UI polling.
 */
export function snapshotAfterBrowserRequestTimeout(snapshot = {}) {
    const campaignId = snapshot.campaignId || snapshot.campaign?._id || '';
    const sessionId = snapshot.sessionId || snapshot.session?._id || '';
    return {
        sameCampaign: true,
        campaignId,
        sessionId,
        uniqueCount: Number(snapshot.uniqueCount ?? snapshot.unique ?? 0),
        queryIndex: Number(snapshot.queryIndex || 1),
        googlePage: Number(snapshot.googlePage || 1),
        fatalTimeout: false,
        keepPolling: true,
        duplicatesCreated: false,
        campaignEnded: false,
    };
}

export const RUN_LOAD = Object.freeze({
    IDLE: 'idle',
    LOADING: 'loading',
    RETRYING: 'retrying',
    READY: 'ready',
    NOT_FOUND: 'not_found',
});

export const SESSION_LOAD_RETRY_MS = Object.freeze([2000, 5000, 10000, 15000, 30000]);

export const RUN_LOAD_MESSAGES = Object.freeze({
    LOADING: 'Loading existing campaign…',
    RETRYING: 'Backend temporarily unavailable. Retrying this run automatically…',
    DEGRADED: 'Connection temporarily unavailable. Retrying…',
    RESTORED: 'Connection restored.',
});

export function nextSessionLoadRetryMs(attempt = 0) {
    const i = Math.max(0, Number(attempt) || 0);
    const last = SESSION_LOAD_RETRY_MS.length - 1;
    return SESSION_LOAD_RETRY_MS[Math.min(i, last)];
}

export function isRetryableSessionLoadError(err) {
    const status = Number(err?.response?.status || err?.status || 0);
    if ([429, 500, 502, 503, 504].includes(status)) return true;
    const code = String(err?.code || err?.cause?.code || '');
    if (['ECONNABORTED', 'ERR_NETWORK', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'].includes(code)) {
        return true;
    }
    if (!err?.response) {
        const msg = String(err?.message || '');
        if (/timeout|network|failed to fetch|load failed|network error/i.test(msg)) return true;
        if (err?.request) return true;
    }
    return false;
}

export function isConfirmedSessionAbsent(err) {
    const status = Number(err?.response?.status || err?.status || 0);
    if (status >= 500 || isRetryableSessionLoadError(err)) return false;
    if (status === 404) return true;
    const msg = String(err?.response?.data?.message || '');
    return /assisted capture session not found|campaign not found/i.test(msg);
}

export function classifySessionLoadError(err) {
    if (isConfirmedSessionAbsent(err)) return 'absent';
    if (isRetryableSessionLoadError(err)) return 'retryable';
    return 'retryable';
}

export function shouldHideStartExtraction({ isRunRoute = false, runLoadStatus = RUN_LOAD.IDLE, hasResult = false } = {}) {
    if (!isRunRoute) return false;
    if (hasResult) return false;
    if (runLoadStatus === RUN_LOAD.NOT_FOUND) return false;
    return true;
}

export function shouldAllowStartExtraction(opts = {}) {
    return !shouldHideStartExtraction(opts);
}

export function reduceRunSessionLoad(state = {}, event = {}) {
    const prev = {
        status: RUN_LOAD.IDLE,
        attempt: 0,
        hasResult: false,
        connectionDegraded: false,
        warningShown: false,
        showRestoredToast: false,
        delayMs: 0,
        sessionId: '',
        campaignId: '',
        uniqueCount: 0,
        queryIndex: 0,
        googlePage: 0,
        ...state,
    };
    const type = String(event.type || '');
    if (type === 'ROUTE') {
        return {
            ...prev,
            status: event.sessionId ? RUN_LOAD.LOADING : RUN_LOAD.IDLE,
            attempt: 0,
            sessionId: String(event.sessionId || ''),
            showRestoredToast: false,
            delayMs: 0,
        };
    }
    if (type === 'SUCCESS') {
        const showRestoredToast = Boolean(prev.connectionDegraded);
        return {
            ...prev,
            status: RUN_LOAD.READY,
            attempt: 0,
            hasResult: true,
            connectionDegraded: false,
            warningShown: false,
            showRestoredToast,
            delayMs: 0,
            sessionId: String(event.sessionId || prev.sessionId || ''),
            campaignId: String(event.campaignId || prev.campaignId || ''),
            uniqueCount: Number(event.uniqueCount ?? prev.uniqueCount ?? 0),
            queryIndex: Number(event.queryIndex ?? prev.queryIndex ?? 0),
            googlePage: Number(event.googlePage ?? prev.googlePage ?? 0),
        };
    }
    if (type === 'ERROR') {
        if (isConfirmedSessionAbsent(event.error) && !prev.hasResult) {
            return {
                ...prev,
                status: RUN_LOAD.NOT_FOUND,
                delayMs: 0,
                connectionDegraded: false,
                warningShown: false,
                showRestoredToast: false,
            };
        }
        return {
            ...prev,
            status: prev.hasResult ? RUN_LOAD.READY : RUN_LOAD.RETRYING,
            connectionDegraded: true,
            warningShown: true,
            showRestoredToast: false,
            delayMs: nextSessionLoadRetryMs(prev.attempt),
            attempt: prev.attempt + 1,
        };
    }
    return prev;
}
