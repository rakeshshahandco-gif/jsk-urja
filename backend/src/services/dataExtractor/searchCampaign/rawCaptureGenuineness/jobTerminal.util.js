/**
 * CP8 job terminal-state helpers. Pure functions — no DB.
 * A job whose processed count has reached total must become terminal
 * even if the worker process dies before the final status write.
 */

const TERMINAL = new Set(['completed', 'partial', 'failed', 'stopped']);

export function isGenuinenessJobTerminalStatus(status) {
    return TERMINAL.has(String(status || ''));
}

export function isJobProcessedComplete(job = {}) {
    const processed = Number(job.processed ?? 0);
    const total = Number(job.total ?? 0);
    if (!Number.isFinite(processed) || !Number.isFinite(total)) return false;
    if (total <= 0) return processed >= 0;
    return processed >= total;
}

/**
 * Pick the terminal status once work is finished (processed >= total) or stop was requested.
 */
export function resolveGenuinenessJobTerminalStatus(job = {}) {
    if (job.stopRequested) return 'stopped';
    const processed = Number(job.processed ?? 0);
    const failedCount = Number(job.failedCount ?? 0);
    if (failedCount && processed > failedCount) return 'partial';
    if (failedCount && processed === failedCount && processed > 0) return 'failed';
    return 'completed';
}

/**
 * True when the automatic pipeline may treat this job as done and start the next batch.
 */
export function canAutoPipelineAdvancePastVerifyJob(job = {}) {
    if (!job) return true;
    if (isGenuinenessJobTerminalStatus(job.status)) return true;
    return isJobProcessedComplete(job);
}
