/**
 * Frontend mirror of backend moduleAccessDecision + moduleState constants.
 */

export const MODULE_STATE = {
    ON: 'ON',
    LOCKED: 'LOCKED',
    OFF: 'OFF',
};

export const MODULE_LOCK_MODE = {
    READ_ONLY: 'READ_ONLY',
    NEW_ENTRY_BLOCKED: 'NEW_ENTRY_BLOCKED',
    FULL_LOCK: 'FULL_LOCK',
};

export const PHASE2_PILOT_MODULE_KEYS = Object.freeze(['tasks', 'crm', 'sales']);

export const MODULE_ACCESS_DENY_REASON = {
    MODULE_NOT_ALLOCATED: 'MODULE_NOT_ALLOCATED',
    MODULE_GUARD_OFF: 'MODULE_GUARD_OFF',
    MODULE_OFF: 'MODULE_OFF',
    MODULE_LOCKED_READ_ONLY: 'MODULE_LOCKED_READ_ONLY',
    MODULE_LOCKED_NEW_ENTRY: 'MODULE_LOCKED_NEW_ENTRY',
    MODULE_LOCKED_FULL: 'MODULE_LOCKED_FULL',
};

export function moduleStatesToMap(moduleStates = []) {
    const map = {};
    for (const entry of moduleStates || []) {
        const key = String(entry?.moduleKey || '').trim().toLowerCase();
        if (!key) continue;
        map[key] = {
            moduleKey: key,
            state: String(entry.state || '').toUpperCase(),
            lockMode: entry.lockMode ? String(entry.lockMode).toUpperCase() : null,
            lockReason: entry.lockReason || '',
            remarks: entry.remarks || '',
            changedBy: entry.changedBy || null,
            changedAt: entry.changedAt || null,
        };
    }
    return map;
}

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

export function evaluateModuleAccess({
    moduleGuardEnabled = false,
    enabledModules = [],
    moduleStates = [],
    moduleCode,
}) {
    const resolved = resolveModuleState({
        moduleGuardEnabled,
        enabledModules,
        moduleStates,
        moduleCode,
    });
    const code = resolved.moduleCode;

    if (!code) {
        return { allowed: true, reason: null, moduleCode: null, ...resolved };
    }

    if (resolved.state === MODULE_STATE.OFF) {
        return {
            allowed: false,
            reason: resolved.source === 'enabledModules_absent'
                ? MODULE_ACCESS_DENY_REASON.MODULE_NOT_ALLOCATED
                : MODULE_ACCESS_DENY_REASON.MODULE_OFF,
            moduleCode: code,
            ...resolved,
        };
    }

    // ON and LOCKED are visible / navigable on FE; mutations enforced by API + helpers
    return {
        allowed: true,
        reason: null,
        moduleCode: code,
        ...resolved,
    };
}

export function formatModuleAccessDeniedMessage(moduleCode, reason = MODULE_ACCESS_DENY_REASON.MODULE_NOT_ALLOCATED) {
    return `Module disabled: ${moduleCode} (${reason})`;
}

export function canCreateInModule(resolved) {
    if (!resolved || resolved.state === MODULE_STATE.OFF) return false;
    if (resolved.state === MODULE_STATE.ON) return true;
    if (resolved.state === MODULE_STATE.LOCKED) {
        if (resolved.lockMode === MODULE_LOCK_MODE.NEW_ENTRY_BLOCKED) return false;
        if (resolved.lockMode === MODULE_LOCK_MODE.READ_ONLY) return false;
        if (resolved.lockMode === MODULE_LOCK_MODE.FULL_LOCK) return false;
    }
    return true;
}

export function canMutateInModule(resolved) {
    if (!resolved || resolved.state === MODULE_STATE.OFF) return false;
    if (resolved.state === MODULE_STATE.ON) return true;
    if (resolved.state === MODULE_STATE.LOCKED) {
        if (resolved.lockMode === MODULE_LOCK_MODE.READ_ONLY) return false;
        if (resolved.lockMode === MODULE_LOCK_MODE.FULL_LOCK) return false;
        if (resolved.lockMode === MODULE_LOCK_MODE.NEW_ENTRY_BLOCKED) return true;
    }
    return true;
}

export function canViewInModule(resolved) {
    if (!resolved || resolved.state === MODULE_STATE.OFF) return false;
    if (resolved.state === MODULE_STATE.LOCKED && resolved.lockMode === MODULE_LOCK_MODE.FULL_LOCK) {
        return false;
    }
    return true;
}
