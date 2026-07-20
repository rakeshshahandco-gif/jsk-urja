/**
 * Authoritative module access decision (company allocation layer).
 * Permission checks remain separate in auth.middleware / ProtectedRoute.
 *
 * Backward-compatible fallback when moduleStates entry is missing:
 * - moduleGuardEnabled false and no explicit state → ON (legacy full access)
 * - moduleGuardEnabled true and code in enabledModules → ON
 * - moduleGuardEnabled true and code absent → OFF (same as prior MODULE_NOT_ALLOCATED)
 * Explicit moduleStates always wins for that key (even if guard is off).
 */

import {
    MODULE_STATE,
    MODULE_LOCK_MODE,
    moduleStatesToMap,
} from './moduleState.constants.js';

export const MODULE_ACCESS_DENY_REASON = {
    MODULE_NOT_ALLOCATED: 'MODULE_NOT_ALLOCATED',
    MODULE_GUARD_OFF: 'MODULE_GUARD_OFF',
    MODULE_OFF: 'MODULE_OFF',
    MODULE_LOCKED_READ_ONLY: 'MODULE_LOCKED_READ_ONLY',
    MODULE_LOCKED_NEW_ENTRY: 'MODULE_LOCKED_NEW_ENTRY',
    MODULE_LOCKED_FULL: 'MODULE_LOCKED_FULL',
};

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

/**
 * Resolve effective ON / LOCKED / OFF for one module code.
 * @returns {{
 *   state: string,
 *   lockMode: string|null,
 *   lockReason: string,
 *   source: string,
 *   moduleCode: string|null,
 * }}
 */
export function resolveModuleState({
    moduleGuardEnabled = false,
    enabledModules = [],
    moduleStates = [],
    moduleCode,
}) {
    const code = String(moduleCode || '').trim().toLowerCase();
    if (!code) {
        return {
            state: MODULE_STATE.ON,
            lockMode: null,
            lockReason: '',
            source: 'no_module',
            moduleCode: null,
        };
    }

    const map = Array.isArray(moduleStates)
        ? moduleStatesToMap(moduleStates)
        : (moduleStates && typeof moduleStates === 'object' ? moduleStates : {});
    const entry = map[code];

    if (entry?.state && MODULE_STATE[entry.state]) {
        return {
            state: entry.state,
            lockMode: entry.state === MODULE_STATE.LOCKED
                ? (entry.lockMode || MODULE_LOCK_MODE.READ_ONLY)
                : null,
            lockReason: entry.lockReason || '',
            source: 'moduleStates',
            moduleCode: code,
            remarks: entry.remarks || '',
            changedBy: entry.changedBy || null,
            changedAt: entry.changedAt || null,
        };
    }

    if (!moduleGuardEnabled) {
        return {
            state: MODULE_STATE.ON,
            lockMode: null,
            lockReason: '',
            source: 'guard_off',
            moduleCode: code,
        };
    }

    if (enabledModules.includes(code)) {
        return {
            state: MODULE_STATE.ON,
            lockMode: null,
            lockReason: '',
            source: 'enabledModules',
            moduleCode: code,
        };
    }

    return {
        state: MODULE_STATE.OFF,
        lockMode: null,
        lockReason: '',
        source: 'enabledModules_absent',
        moduleCode: code,
    };
}

/**
 * POST without a document id is treated as create; POST /:id/... is an action on existing.
 */
export function isLikelyCreateRequest(method, pathname = '') {
    if (String(method || '').toUpperCase() !== 'POST') return false;
    const p = String(pathname || '').split('?')[0];
    const parts = p.replace(/^\/api\/v1/i, '').split('/').filter(Boolean);
    return !parts.some((seg) => OBJECT_ID_RE.test(seg));
}

/**
 * @returns {{
 *   allowed: boolean,
 *   reason: string|null,
 *   moduleCode: string|null,
 *   state: string,
 *   lockMode: string|null,
 *   lockReason: string,
 *   source: string,
 * }}
 */
export function evaluateModuleAccess({
    moduleGuardEnabled = false,
    enabledModules = [],
    moduleStates = [],
    moduleCode,
    method = 'GET',
    pathname = '',
    isPlatformAdmin = false,
}) {
    const resolved = resolveModuleState({
        moduleGuardEnabled,
        enabledModules,
        moduleStates,
        moduleCode,
    });
    const code = resolved.moduleCode;
    const m = String(method || 'GET').toUpperCase();
    const isRead = READ_METHODS.has(m);

    if (!code) {
        return {
            allowed: true,
            reason: null,
            moduleCode: null,
            state: MODULE_STATE.ON,
            lockMode: null,
            lockReason: '',
            source: resolved.source,
        };
    }

    if (resolved.state === MODULE_STATE.OFF) {
        return {
            allowed: false,
            reason: resolved.source === 'enabledModules_absent'
                ? MODULE_ACCESS_DENY_REASON.MODULE_NOT_ALLOCATED
                : MODULE_ACCESS_DENY_REASON.MODULE_OFF,
            moduleCode: code,
            state: MODULE_STATE.OFF,
            lockMode: null,
            lockReason: resolved.lockReason,
            source: resolved.source,
        };
    }

    if (resolved.state === MODULE_STATE.ON) {
        return {
            allowed: true,
            reason: null,
            moduleCode: code,
            state: MODULE_STATE.ON,
            lockMode: null,
            lockReason: '',
            source: resolved.source,
        };
    }

    // LOCKED
    const lockMode = resolved.lockMode || MODULE_LOCK_MODE.READ_ONLY;

    if (lockMode === MODULE_LOCK_MODE.FULL_LOCK) {
        if (isPlatformAdmin && isRead) {
            return {
                allowed: true,
                reason: null,
                moduleCode: code,
                state: MODULE_STATE.LOCKED,
                lockMode,
                lockReason: resolved.lockReason,
                source: resolved.source,
            };
        }
        return {
            allowed: false,
            reason: MODULE_ACCESS_DENY_REASON.MODULE_LOCKED_FULL,
            moduleCode: code,
            state: MODULE_STATE.LOCKED,
            lockMode,
            lockReason: resolved.lockReason,
            source: resolved.source,
        };
    }

    if (lockMode === MODULE_LOCK_MODE.READ_ONLY) {
        if (isRead) {
            return {
                allowed: true,
                reason: null,
                moduleCode: code,
                state: MODULE_STATE.LOCKED,
                lockMode,
                lockReason: resolved.lockReason,
                source: resolved.source,
            };
        }
        return {
            allowed: false,
            reason: MODULE_ACCESS_DENY_REASON.MODULE_LOCKED_READ_ONLY,
            moduleCode: code,
            state: MODULE_STATE.LOCKED,
            lockMode,
            lockReason: resolved.lockReason,
            source: resolved.source,
        };
    }

    if (lockMode === MODULE_LOCK_MODE.NEW_ENTRY_BLOCKED) {
        if (isLikelyCreateRequest(m, pathname)) {
            return {
                allowed: false,
                reason: MODULE_ACCESS_DENY_REASON.MODULE_LOCKED_NEW_ENTRY,
                moduleCode: code,
                state: MODULE_STATE.LOCKED,
                lockMode,
                lockReason: resolved.lockReason,
                source: resolved.source,
            };
        }
        return {
            allowed: true,
            reason: null,
            moduleCode: code,
            state: MODULE_STATE.LOCKED,
            lockMode,
            lockReason: resolved.lockReason,
            source: resolved.source,
        };
    }

    // Unknown lock mode → treat as READ_ONLY
    if (isRead) {
        return {
            allowed: true,
            reason: null,
            moduleCode: code,
            state: MODULE_STATE.LOCKED,
            lockMode,
            lockReason: resolved.lockReason,
            source: resolved.source,
        };
    }
    return {
        allowed: false,
        reason: MODULE_ACCESS_DENY_REASON.MODULE_LOCKED_READ_ONLY,
        moduleCode: code,
        state: MODULE_STATE.LOCKED,
        lockMode,
        lockReason: resolved.lockReason,
        source: resolved.source,
    };
}

/** Menu / route visibility: OFF hidden; ON and LOCKED visible. */
export function isModuleVisible(decisionOrResolved) {
    const state = decisionOrResolved?.state;
    return state !== MODULE_STATE.OFF;
}

export function formatModuleAccessDeniedMessage(moduleCode, reason = MODULE_ACCESS_DENY_REASON.MODULE_NOT_ALLOCATED) {
    if (reason === MODULE_ACCESS_DENY_REASON.MODULE_LOCKED_READ_ONLY) {
        return `Module locked (read-only): ${moduleCode}`;
    }
    if (reason === MODULE_ACCESS_DENY_REASON.MODULE_LOCKED_NEW_ENTRY) {
        return `Module locked (new entry blocked): ${moduleCode}`;
    }
    if (reason === MODULE_ACCESS_DENY_REASON.MODULE_LOCKED_FULL) {
        return `Module fully locked: ${moduleCode}`;
    }
    if (reason === MODULE_ACCESS_DENY_REASON.MODULE_OFF) {
        return `Module disabled: ${moduleCode} (${reason})`;
    }
    return `Module disabled: ${moduleCode} (${reason})`;
}
