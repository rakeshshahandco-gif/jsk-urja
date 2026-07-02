import { apiClient } from '@/config/apiClient';

export const getDeploymentManagerOverview = async () => {
    const res = await apiClient.get('/deployment-manager/overview');
    return res.data?.data || res.data;
};

export const getDeploymentManagerReport = async () => {
    const res = await apiClient.get('/deployment-manager/report');
    return res.data?.data || res.data;
};

export const getClientDeployChecklist = async (clientKey) => {
    const res = await apiClient.get(`/deployment-manager/checklist/${clientKey}`);
    return res.data?.data || res.data;
};

export const updateCompanyDeploymentTracking = async (companyId, payload) => {
    const res = await apiClient.patch(`/deployment-manager/company/${companyId}/tracking`, payload);
    return res.data?.data || res.data;
};

export const applyCompanyReferenceDefaults = async (companyId, clientKey) => {
    const res = await apiClient.post(`/deployment-manager/company/${companyId}/apply-reference`, { clientKey });
    return res.data?.data || res.data;
};

export const getLocalGitInfo = async () => {
    const res = await apiClient.get('/deployment-manager/git/local');
    return res.data?.data || res.data;
};

export const getCompanyDeployHistory = async (companyId) => {
    const res = await apiClient.get(`/deployment-manager/company/${companyId}/history`);
    return res.data?.data || res.data;
};

export const addCompanyDeployRecord = async (companyId, payload) => {
    const res = await apiClient.post(`/deployment-manager/company/${companyId}/history`, payload);
    return res.data?.data || res.data;
};

/** Browser-only health probe — does not call our backend proxy */
export async function probeBackendHealth(backendUrl) {
    const base = String(backendUrl || '').trim().replace(/\/$/, '');
    if (!base) return { ok: false, message: 'No backend URL' };
    try {
        const res = await fetch(`${base}/api/v1/health`, { method: 'GET', cache: 'no-store' });
        const text = await res.text();
        return { ok: res.ok, status: res.status, body: text };
    } catch (err) {
        return { ok: false, message: err?.message || 'Health check failed' };
    }
}
