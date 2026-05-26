import api from './api';

const BASE = '/user-ui-preferences/me';

/** Fetch the current user's UI preferences. Returns { userId, preferences }. */
export const getMyUiPreferences = async () => {
    const r = await api.get(BASE);
    return r.data?.data || { preferences: {} };
};

/**
 * Patch the current user's UI preferences. Backend shallow-merges the patch,
 * so partial updates (e.g. only sidebar colors) preserve other keys.
 */
export const updateMyUiPreferences = async (preferences) => {
    const r = await api.patch(BASE, { preferences });
    return r.data?.data || { preferences: {} };
};

/** Wipe the user's UI preferences. Falls back to defaults on next load. */
export const resetMyUiPreferences = async () => {
    const r = await api.delete(BASE);
    return r.data?.data || { preferences: {} };
};
