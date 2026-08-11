import api from './api';

export async function fetchModuleLocks() {
    const res = await api.get('/module-locks');
    return res.data?.data;
}

export async function fetchModuleLock(moduleKey) {
    const res = await api.get(`/module-locks/${encodeURIComponent(moduleKey)}`);
    return res.data?.data;
}

export async function updateModuleLock(moduleKey, { locked, scope, reason }) {
    const res = await api.put(`/module-locks/${encodeURIComponent(moduleKey)}`, {
        locked,
        scope,
        reason,
    });
    return res.data?.data;
}
