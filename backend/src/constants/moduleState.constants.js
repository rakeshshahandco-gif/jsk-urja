/**
 * Phase 2 — company module allocation states (extends enabledModules).
 * Pilot modules only for enforcement UI; schema accepts any registry key.
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

/** Pilot keys approved for Phase 2 ON / LOCKED / OFF. Do not rename. */
export const PHASE2_PILOT_MODULE_KEYS = Object.freeze(['tasks', 'crm', 'sales']);

export const MODULE_STATE_VALUES = Object.freeze(Object.values(MODULE_STATE));
export const MODULE_LOCK_MODE_VALUES = Object.freeze(Object.values(MODULE_LOCK_MODE));

export function isPilotModuleKey(moduleKey) {
    return PHASE2_PILOT_MODULE_KEYS.includes(String(moduleKey || '').trim().toLowerCase());
}

/**
 * Build moduleKey → state entry map from company.moduleStates array.
 */
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
