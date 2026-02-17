import api from './api';

export const getTaskGroups = async (params) => {
    const response = await api.get('/task-groups', { params });
    return response.data.data;
};

export const getTaskGroup = async (id) => {
    const response = await api.get(`/task-groups/${id}`);
    return response.data.data;
};

export const createTemplate = async (data) => {
    const response = await api.post('/task-groups/templates', data);
    return response.data.data;
};

export const generateInstance = async (templateId, period) => {
    const response = await api.post(`/task-groups/${templateId}/generate`, { period });
    return response.data.data;
};
