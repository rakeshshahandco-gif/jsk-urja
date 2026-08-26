/**
 * In-memory stop flag for an in-flight Instagram extract (same Node process).
 * Does not persist. Does not affect Facebook / Google / other platforms.
 */

const running = new Map();

function key(companyId) {
    return String(companyId || '');
}

export function beginInstagramExtract(companyId) {
    const k = key(companyId);
    running.set(k, { stopRequested: false, startedAt: Date.now() });
    return {
        shouldStop: () => Boolean(running.get(k)?.stopRequested),
        stopRequested: () => Boolean(running.get(k)?.stopRequested),
    };
}

export function requestInstagramExtractStop(companyId) {
    const k = key(companyId);
    const cur = running.get(k);
    if (!cur) {
        return { ok: true, running: false, stopRequested: false };
    }
    cur.stopRequested = true;
    running.set(k, cur);
    return { ok: true, running: true, stopRequested: true };
}

export function endInstagramExtract(companyId) {
    running.delete(key(companyId));
}

export function isInstagramExtractRunning(companyId) {
    return running.has(key(companyId));
}
