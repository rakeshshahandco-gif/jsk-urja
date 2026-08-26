/**
 * Instagram extract control: 5 is a batch/pass size, never a total-profile cap.
 * Total continues until the source is exhausted, the user stops, the session
 * expires, Instagram requires a safety pause, or a genuine technical failure.
 */

export const INSTAGRAM_BATCH_SIZE = 5;
/** Public HTML providers cap items per query page; that is not our product total. */
export const INSTAGRAM_PUBLIC_PROVIDER_PAGE = 20;
/** Ingest payload ceiling (shared RawCapture batch max). Not a product total of 5. */
export const INSTAGRAM_INGEST_CHUNK = 100;

export const INSTAGRAM_STOP_REASONS = Object.freeze({
    SOURCE_EXHAUSTED: 'source_exhausted',
    USER_STOP: 'user_stop',
    SESSION_EXPIRED: 'session_expired',
    SOURCE_SAFETY_PAUSE: 'source_safety_pause',
    TECHNICAL_FAILURE: 'technical_failure',
});

export function instagramCaptureKey(record = {}) {
    const url = String(
        record.resultUrlNormalized
        || record.resultUrlOriginal
        || record.resultUrl
        || record.pageUrl
        || '',
    ).trim().toLowerCase().replace(/\/+$/, '');
    if (url) return url;
    const id = String(record.sourceRecordId || '').trim().toLowerCase();
    return id || '';
}

export function addSeenKey(seen, record) {
    const key = instagramCaptureKey(record);
    if (key) seen.add(key);
    return key;
}

export function isAlreadySeen(seen, record) {
    const key = instagramCaptureKey(record);
    return Boolean(key && seen.has(key));
}

/**
 * Take the next unseen profiles for one pass. Does not cap the remaining list.
 */
export function nextUnseenBatch(candidates = [], seen, batchSize = INSTAGRAM_BATCH_SIZE) {
    const size = Math.max(1, Number(batchSize) || INSTAGRAM_BATCH_SIZE);
    const batch = [];
    let alreadyKnown = 0;
    let considered = 0;
    for (const rec of candidates) {
        considered += 1;
        if (isAlreadySeen(seen, rec)) {
            alreadyKnown += 1;
            continue;
        }
        batch.push(rec);
        if (batch.length >= size) break;
    }
    return {
        batch,
        alreadyKnown,
        considered,
        remainingUnseenHint: null,
        batchSize: size,
        cappedByBatchSize: batch.length === size,
    };
}

export function splitIntoBatches(records = [], batchSize = INSTAGRAM_BATCH_SIZE) {
    const size = Math.max(1, Number(batchSize) || INSTAGRAM_BATCH_SIZE);
    const batches = [];
    for (let i = 0; i < records.length; i += size) {
        batches.push({
            index: batches.length + 1,
            records: records.slice(i, i + size),
            newCount: Math.min(size, records.length - i),
        });
    }
    return batches;
}

export function resolveInstagramStopReason({
    stopRequested = false,
    sessionExpired = false,
    challenge = '',
    technicalError = '',
    queueEmpty = false,
    noNewAfterScroll = false,
    queriesExhausted = false,
} = {}) {
    if (stopRequested) return INSTAGRAM_STOP_REASONS.USER_STOP;
    if (sessionExpired) return INSTAGRAM_STOP_REASONS.SESSION_EXPIRED;
    if (technicalError) return INSTAGRAM_STOP_REASONS.TECHNICAL_FAILURE;
    const ch = String(challenge || '').toLowerCase();
    if (ch) {
        if (/login|session expired|sessionid/i.test(ch)) return INSTAGRAM_STOP_REASONS.SESSION_EXPIRED;
        return INSTAGRAM_STOP_REASONS.SOURCE_SAFETY_PAUSE;
    }
    if (queueEmpty || noNewAfterScroll || queriesExhausted) return INSTAGRAM_STOP_REASONS.SOURCE_EXHAUSTED;
    return '';
}

export function instagramSessionExpiredFromUrl(pageUrl = '') {
    return /instagram\.com\/accounts\/login/i.test(String(pageUrl || ''));
}

export function instagramRunStatus(stopReason, { inProgress = false } = {}) {
    if (inProgress && !stopReason) return 'Loading more';
    switch (stopReason) {
        case INSTAGRAM_STOP_REASONS.SOURCE_EXHAUSTED:
            return 'Source exhausted';
        case INSTAGRAM_STOP_REASONS.USER_STOP:
            return 'Stopped';
        case INSTAGRAM_STOP_REASONS.SESSION_EXPIRED:
            return 'Session expired';
        case INSTAGRAM_STOP_REASONS.SOURCE_SAFETY_PAUSE:
            return 'Paused for source safety';
        case INSTAGRAM_STOP_REASONS.TECHNICAL_FAILURE:
            return 'Technical failure';
        default:
            return inProgress ? 'Loading more' : 'Idle';
    }
}

export function summarizeInstagramRun({
    batchSize = INSTAGRAM_BATCH_SIZE,
    batches = [],
    newThisRun = 0,
    alreadyKnown = 0,
    totalCaptured = 0,
    stopReason = '',
    lastBatchNew = 0,
} = {}) {
    const last = batches[batches.length - 1];
    return {
        batchSize,
        batches: batches.map((b) => ({
            index: b.index,
            newCount: b.newCount ?? (b.records || []).length,
            handles: (b.records || []).map((r) => String(r.sourceRecordId || r.title || r.resultUrl || '').slice(0, 80)),
        })),
        newThisRun,
        newThisBatch: lastBatchNew || last?.newCount || 0,
        alreadyKnown,
        totalCaptured,
        status: instagramRunStatus(stopReason),
        stopReason: stopReason || INSTAGRAM_STOP_REASONS.SOURCE_EXHAUSTED,
    };
}

/** Listing page size must never be treated as an extraction total. */
export function listingPageSizeIsNotExtractCap(pageSize, extractedTotal) {
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
    return Number(extractedTotal) >= 0 && ps !== Number(extractedTotal);
}
