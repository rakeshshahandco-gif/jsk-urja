/** Pure helpers for Clear History UI. No React. */

export function validateClearConfirm({
    confirmText = '',
    scope = '',
    confirmAll = false,
    includeProtected = false,
    confirmProtected = false,
} = {}) {
    if (String(confirmText || '').trim().toUpperCase() !== 'CLEAR') {
        return { ok: false, error: 'Type CLEAR to confirm' };
    }
    if (scope === 'all_extractor' && confirmAll !== true) {
        return { ok: false, error: 'Tick the second confirmation for Clear All Extractor History' };
    }
    if (includeProtected === true && confirmProtected !== true) {
        return { ok: false, error: 'Protected verified/converted records are kept unless you confirm that extra option' };
    }
    return { ok: true, error: '' };
}

export function isClearConfirmEnabled({ busy, confirmText } = {}) {
    return !busy && String(confirmText || '').trim().toUpperCase() === 'CLEAR';
}

export function facebookClearLabel(scope, matchKeyword, matchLocation) {
    if (scope === 'facebook_all' && (matchKeyword || matchLocation)) return 'Clear matching Facebook history';
    if (scope === 'facebook_all') return 'All Facebook extraction history';
    if (scope === 'facebook_current') return 'Current Facebook search/history';
    return scope;
}

export function buildHistoryClearPayload({
    scope,
    keyword = '',
    location = '',
    matchKeyword = false,
    matchLocation = false,
    reason = '',
    includeProtected = false,
} = {}) {
    const facebookAll = scope === 'facebook_all';
    return {
        scope,
        keyword: String(keyword || '').trim(),
        location: String(location || '').trim(),
        matchKeyword: facebookAll ? matchKeyword === true : matchKeyword === true || scope === 'facebook_current',
        matchLocation: facebookAll ? matchLocation === true : matchLocation === true || scope === 'facebook_current',
        reason: String(reason || '').slice(0, 300),
        includeProtected: includeProtected === true,
    };
}

export function historyClearErrorMessage(err) {
    const api = err?.response?.data?.message || err?.response?.data?.error;
    const msg = api || err?.message || 'Unable to clear history';
    return `Unable to clear history: ${String(msg).slice(0, 240)}`;
}

export const HISTORY_CLEARED_EVENT = 'extractor-history-cleared';

export function notifyHistoryCleared(detail = {}) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(HISTORY_CLEARED_EVENT, { detail }));
}
