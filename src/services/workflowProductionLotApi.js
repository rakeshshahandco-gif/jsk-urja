import api from './api';

const BASE = '/workflow-production-lots';

export const listWorkflowProductionLots = async (params = {}) => {
    const res = await api.get(BASE, { params });
    return res.data.data || [];
};

export const getWorkflowProductionLot = async (id) => {
    const res = await api.get(`${BASE}/${id}`);
    return res.data.data;
};

export const getWorkflowPreviewForCompany = async (companyId) => {
    const res = await api.get(`${BASE}/preview/${companyId}`);
    return res.data.data;
};

export const createWorkflowProductionLot = async (payload) => {
    const res = await api.post(BASE, payload);
    return res.data.data;
};

export const startWorkflowProductionStage = async (lotId, stageIndex, payload = {}) => {
    const res = await api.post(`${BASE}/${lotId}/stages/${stageIndex}/start`, payload);
    return res.data.data;
};

export const completeWorkflowProductionStage = async (lotId, stageIndex, payload) => {
    const res = await api.post(`${BASE}/${lotId}/stages/${stageIndex}/complete`, payload);
    return res.data.data;
};

export const skipWorkflowProductionStage = async (lotId, stageIndex, payload = {}) => {
    const res = await api.post(`${BASE}/${lotId}/stages/${stageIndex}/skip`, payload);
    return res.data.data;
};

export const uploadWorkflowProductionAttachment = async (lotId, stageIndex, file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await api.post(`${BASE}/${lotId}/stages/${stageIndex}/attachment`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
};
