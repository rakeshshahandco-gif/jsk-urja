/**
 * Facebook Group Collector — one-click automatic run helpers.
 * Pure functions only. No Chrome. No new collections.
 */

import { FACEBOOK_MEMBER_COLLECTOR_MODES } from './facebookMemberCollector.util.js';

export const FACEBOOK_AUTO_MAX_TECHNICAL_RETRIES = 3;
export const FACEBOOK_AUTO_MAX_REVIEW_LOOPS = 5000;
export const FACEBOOK_AUTO_WEBSITE_ENRICH_BATCH = 5;

export const FACEBOOK_AUTO_STAGES = Object.freeze({
    DISCOVERING: 'DISCOVERING',
    REVIEWING: 'REVIEWING',
    WEBSITE_ENRICHMENT: 'WEBSITE ENRICHMENT',
    CONSOLIDATING: 'CONSOLIDATING',
    COMPLETE: 'COMPLETE',
    PAUSED: 'PAUSED',
    ATTENTION: 'ATTENTION_REQUIRED',
    SOURCE_EXHAUSTED: 'SOURCE_EXHAUSTED',
    TECHNICAL_FAILURE: 'TECHNICAL_FAILURE',
});

export function facebookAutoRetryDelayMs(attempt = 1) {
    const n = Math.max(1, Number(attempt) || 1);
    return Math.min(8000, 2000 * (2 ** (n - 1)));
}

export function shouldRetryTechnicalFailure({ attempt = 1, maxAttempts = FACEBOOK_AUTO_MAX_TECHNICAL_RETRIES, stopReason = '' } = {}) {
    if (Number(attempt) >= Number(maxAttempts)) return false;
    const reason = String(stopReason || '');
    return reason === 'technical_failure' || reason === '' || /timeout|unresponsive|not ready|slow load/i.test(reason);
}

export function shouldContinueAutomaticDiscovery({ stopReason = '', shouldStop = false } = {}) {
    if (shouldStop) return false;
    const reason = String(stopReason || '');
    if (!reason || reason === 'batch_complete') return true;
    return false;
}

export function shouldAdvanceToReview({ stopReason = '', autoReview = true, shouldStop = false } = {}) {
    if (shouldStop || !autoReview) return false;
    return String(stopReason) === 'source_exhausted';
}

export function shouldContinueAutomaticReview({ pendingCount = 0, shouldStop = false, loops = 0, maxLoops = FACEBOOK_AUTO_MAX_REVIEW_LOOPS } = {}) {
    if (shouldStop) return false;
    if (Number(loops) >= Number(maxLoops)) return false;
    return Number(pendingCount) > 0;
}

export function nextAutoStage({ currentStage = '', stopReason = '', pendingCount = 0, autoReview = true, shouldStop = false, paused = false } = {}) {
    if (paused || shouldStop) return FACEBOOK_AUTO_STAGES.PAUSED;
    if (stopReason === 'session_attention_required' || stopReason === 'session_expired') {
        return FACEBOOK_AUTO_STAGES.ATTENTION;
    }
    if (stopReason === 'technical_failure') return FACEBOOK_AUTO_STAGES.TECHNICAL_FAILURE;
    if (currentStage === FACEBOOK_AUTO_STAGES.DISCOVERING || !currentStage) {
        if (shouldContinueAutomaticDiscovery({ stopReason, shouldStop })) return FACEBOOK_AUTO_STAGES.DISCOVERING;
        if (shouldAdvanceToReview({ stopReason, autoReview, shouldStop })) return FACEBOOK_AUTO_STAGES.REVIEWING;
        if (stopReason === 'source_exhausted' && !autoReview) return FACEBOOK_AUTO_STAGES.SOURCE_EXHAUSTED;
    }
    if (currentStage === FACEBOOK_AUTO_STAGES.REVIEWING) {
        if (shouldContinueAutomaticReview({ pendingCount, shouldStop })) return FACEBOOK_AUTO_STAGES.REVIEWING;
        return FACEBOOK_AUTO_STAGES.WEBSITE_ENRICHMENT;
    }
    if (currentStage === FACEBOOK_AUTO_STAGES.WEBSITE_ENRICHMENT) return FACEBOOK_AUTO_STAGES.CONSOLIDATING;
    if (currentStage === FACEBOOK_AUTO_STAGES.CONSOLIDATING) return FACEBOOK_AUTO_STAGES.COMPLETE;
    return currentStage || FACEBOOK_AUTO_STAGES.DISCOVERING;
}

export function isSameFacebookAutoLock({ runningGroupId = '', runningGroupUrl = '', groupId = '', groupUrl = '' } = {}) {
    const a = String(runningGroupId || '').trim();
    const b = String(groupId || '').trim();
    if (a && b) return a === b;
    const ua = String(runningGroupUrl || '').replace(/\/$/, '').toLowerCase();
    const ub = String(groupUrl || '').replace(/\/$/, '').toLowerCase();
    return Boolean(ua && ub && ua === ub);
}

export function duplicateAutoRunMessage({ sameGroup = true } = {}) {
    return sameGroup
        ? 'This group collection is already running.'
        : 'Another Facebook collection is already running.';
}

export function isFullAutomaticCollectorMode(mode = '') {
    return String(mode) === FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_AUTOMATIC
        || String(mode) === 'full_automatic';
}

export function isReviewAllCollectorMode(mode = '') {
    return String(mode) === FACEBOOK_MEMBER_COLLECTOR_MODES.REVIEW_ALL
        || String(mode) === 'review_all';
}

export function discoveryModeForAuto() {
    return FACEBOOK_MEMBER_COLLECTOR_MODES.FULL_DISCOVERY;
}
