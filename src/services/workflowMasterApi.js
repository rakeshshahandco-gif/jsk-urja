import api from './api';

export const getWorkflowMasters = async (params = {}) => {
    const res = await api.get('/workflow-masters', { params });
    return res.data.data || [];
};

export const getWorkflowMaster = async (id) => {
    const res = await api.get(`/workflow-masters/${id}`);
    return res.data.data;
};

export const getWorkflowMasterByTemplate = async (templateId) => {
    const res = await api.get(`/workflow-masters/by-template/${templateId}`);
    return res.data.data;
};

export const getWorkflowRegistry = async () => {
    const res = await api.get('/workflow-masters/registry');
    return res.data.data || {};
};

export const createWorkflowMaster = async (payload) => {
    const res = await api.post('/workflow-masters', payload);
    return res.data.data;
};

export const updateWorkflowMaster = async (id, payload) => {
    const res = await api.put(`/workflow-masters/${id}`, payload);
    return res.data.data;
};

export const reorderWorkflowStages = async (id, stages) => {
    const res = await api.patch(`/workflow-masters/${id}/stages/reorder`, { stages });
    return res.data.data;
};

export const toggleWorkflowMasterActive = async (id) => {
    const res = await api.patch(`/workflow-masters/${id}/toggle-active`);
    return res.data.data;
};

export const deleteWorkflowMaster = async (id) => {
    const res = await api.delete(`/workflow-masters/${id}`);
    return res.data.data;
};
