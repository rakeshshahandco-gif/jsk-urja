import api from './api';

const BASE = '/textile-job-work-rates';

export async function getTextileJobWorkMeta() {
    const res = await api.get(`${BASE}/meta`);
    return res.data?.data;
}

export async function getTextileJobWorkEligibility(companyId) {
    const res = await api.get(`${BASE}/eligibility`, { params: { companyId } });
    return res.data?.data;
}

export async function listTextileJobWorkRates(params = {}) {
    const res = await api.get(BASE, { params });
    return res.data?.data || [];
}

export async function lookupTextileJobWorkRate(params) {
    const res = await api.get(`${BASE}/lookup`, { params });
    return res.data?.data;
}

export async function createTextileJobWorkRate(data) {
    const res = await api.post(BASE, data);
    return res.data?.data;
}

export async function updateTextileJobWorkRate(id, data) {
    const res = await api.patch(`${BASE}/${id}`, data);
    return res.data?.data;
}

export async function deleteTextileJobWorkRate(id, params = {}) {
    const res = await api.delete(`${BASE}/${id}`, { params });
    return res.data;
}

export async function getVendorRateReport(params = {}) {
    const res = await api.get(`${BASE}/reports/vendor-rates`, { params });
    return res.data?.data || [];
}

export async function getWorkerRateReport(params = {}) {
    const res = await api.get(`${BASE}/reports/worker-rates`, { params });
    return res.data?.data || [];
}

export async function getProcessCostSummary(params = {}) {
    const res = await api.get(`${BASE}/reports/process-cost-summary`, { params });
    return res.data?.data;
}
