/**
 * Campaign totals are unlimited by default.
 * Batch / page / scroll sizes are operational only — never a product cap.
 */

export const UNLIMITED_CAMPAIGN_TOTAL = 0;

/** Public HTML provider page size. Not a campaign maximum. */
export const FACEBOOK_PUBLIC_PROVIDER_PAGE = 20;

export const GENUINE_CAMPAIGN_STOPS = Object.freeze([
    'source_exhausted',
    'user_stop',
    'session_expired',
    'source_safety_pause',
    'technical_failure',
]);

export const FALSE_COMPLETE_STOPS = Object.freeze([
    'rate_limit',
    'temporary_block',
    'challenge',
    'provider_pause',
    'source_safety_pause',
    'safety_pause',
]);

export function campaignTotalIsUnlimited(maxResults) {
    const n = Number(maxResults);
    return !Number.isFinite(n) || n <= 0;
}

export function reachedFixedCampaignCap(collected, maxResults) {
    if (campaignTotalIsUnlimited(maxResults)) return false;
    return Number(collected) >= Number(maxResults);
}

/**
 * Simulate batched collection with no campaign cap.
 * Memory stays O(batchSize): only the last batch is retained.
 */
export function simulateUnboundedCollection({
    totalAvailable,
    batchSize = 50,
    uniqueRatio = 0.65,
    providerPauseAt = 0,
} = {}) {
    const available = Math.max(0, Number(totalAvailable) || 0);
    const size = Math.max(1, Number(batchSize) || 50);
    let collected = 0;
    let unique = 0;
    let batches = 0;
    let lastBatch = 0;
    let peakMemory = 0;
    let stopReason = 'source_exhausted';
    let completed = false;

    while (collected < available) {
        const next = Math.min(size, available - collected);
        collected += next;
        unique = Math.floor(collected * uniqueRatio);
        lastBatch = next;
        batches += 1;
        peakMemory = Math.max(peakMemory, next);
        if (providerPauseAt > 0 && collected >= providerPauseAt && collected < available) {
            stopReason = 'source_safety_pause';
            completed = false;
            break;
        }
    }
    if (stopReason === 'source_exhausted' && collected >= available) {
        completed = true;
    }
    return {
        collected,
        unique,
        batches,
        lastBatch,
        peakMemory,
        batchSize: size,
        stopReason,
        completed,
        continuedPast500: collected > 500,
        continuedPast1000: collected > 1000,
        continuedPast5000: collected > 5000 || available <= 5000,
        uniqueDidNotStopSource: unique < collected || collected === 0,
    };
}

export function isFalseCompleteFromProvider(stopReason) {
    const r = String(stopReason || '').toLowerCase();
    return FALSE_COMPLETE_STOPS.includes(r) || /rate.?limit|temporar|challenge|blocked|safety.?pause/i.test(r);
}
