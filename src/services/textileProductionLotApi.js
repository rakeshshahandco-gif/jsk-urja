import api from './api';

const BASE = '/textile-production-lots';

export const getTextileEligibility = async (companyId) => {
    const res = await api.get(`${BASE}/eligibility/${companyId}`);
    return res.data.data;
};

export const listTextileProductionLots = async (params = {}) => {
    const res = await api.get(BASE, { params });
    return res.data.data || [];
};

export const getTextileProductionLot = async (id) => {
    const res = await api.get(`${BASE}/${id}`);
    return res.data.data;
};

export const getTextileLotReport = async (id) => {
    const res = await api.get(`${BASE}/${id}/report`);
    return res.data.data;
};

export const createTextileProductionLot = async (payload) => {
    const res = await api.post(BASE, payload);
    return res.data.data;
};

export const recordDyeingIssue = async (lotId, payload) => {
    const res = await api.post(`${BASE}/${lotId}/dyeing-issue`, payload);
    return res.data.data;
};

export const recordDyeingReturn = async (lotId, payload) => {
    const res = await api.post(`${BASE}/${lotId}/dyeing-return`, payload);
    return res.data.data;
};

export const startTextileStage = async (lotId, stageIndex, payload = {}) => {
    const res = await api.post(`${BASE}/${lotId}/stages/${stageIndex}/start`, payload);
    return res.data.data;
};

export const completeTextileStage = async (lotId, stageIndex, payload = {}) => {
    const res = await api.post(`${BASE}/${lotId}/stages/${stageIndex}/complete`, payload);
    return res.data.data;
};
