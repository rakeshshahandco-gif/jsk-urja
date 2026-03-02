import api from './api';

const BASE = '/work-orders';

export const getDashboardStats = async () => {
    const response = await api.get(`${BASE}/dashboard-stats`);
    return response.data.data;
};

export const getWorkOrders = async (params) => {
    const response = await api.get(BASE, { params });
    return response.data.data;
};

export const getWorkOrderById = async (id) => {
    const response = await api.get(`${BASE}/${id}`);
    return response.data.data;
};

export const createWorkOrder = async (data) => {
    const response = await api.post(BASE, data);
    return response.data.data;
};

export const updateWorkOrder = async (id, data) => {
    const response = await api.put(`${BASE}/${id}`, data);
    return response.data.data;
};

export const releaseWorkOrder = async (id) => {
    const response = await api.patch(`${BASE}/${id}/release`);
    return response.data.data;
};

export const updateStage = async (id, seq, data) => {
    const response = await api.patch(`${BASE}/${id}/stages/${seq}`, data);
    return response.data.data;
};

export const updateMaterialStatus = async (id, data) => {
    const response = await api.patch(`${BASE}/${id}/material-status`, data);
    return response.data.data;
};

export const refreshMaterialStock = async (id) => {
    const response = await api.patch(`${BASE}/${id}/refresh-stock`);
    return response.data.data;
};

export const deleteWorkOrder = async (id) => {
    const response = await api.delete(`${BASE}/${id}`);
    return response.data;
};

// Production Logs API
export const addProductionLog = async (id, seq, data) => {
    const response = await api.post(`${BASE}/${id}/stages/${seq}/production-logs`, data);
    return response.data; // Note returning full response.data to get the message
};

export const deleteProductionLog = async (id, seq, logId) => {
    const response = await api.delete(`${BASE}/${id}/stages/${seq}/production-logs/${logId}`);
    return response.data;
};
