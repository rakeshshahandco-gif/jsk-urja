/**
 * Null-safe helpers for Simple Lead Search owner UI.
 * Keep pure (no React) so node:test can cover render-data edge cases.
 */

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
 * @param {object|null|undefined} autoProcessing
 * @param {boolean} ownerFullAuto
 */
export function shouldKeepPollingForAutoProcessing(autoProcessing, ownerFullAuto = true) {
    if (!autoProcessing) return Boolean(ownerFullAuto);
    const status = autoProcessing.status || 'idle';
    if (status === 'paused_owner' || status === 'stopped') return false;
    const backlog = Number(autoProcessing.counts?.processingBacklog || 0);
    if (backlog > 0) return true;
    if (status === 'running') return true;
    if (autoProcessing.enabled || autoProcessing.ownerWorkflowEnabled) return true;
    return Boolean(ownerFullAuto && status === 'completed');
}

/**
 * Mutually exclusive reconcile buckets from autoProcessing.counts.
 * @param {object|null|undefined} counts
 */
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