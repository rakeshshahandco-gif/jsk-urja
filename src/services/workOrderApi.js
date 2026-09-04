import api from './api';

const BASE = '/work-orders';

export const getDashboardStats = async (params) => {
    const response = await api.get(`${BASE}/dashboard-stats`, { params });
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

export const getSectionWorkOrders = async (parentId) => {
    const response = await api.get(`${BASE}/${parentId}/section-work-orders`);
    return response.data.data;
};

export const createSectionWorkOrder = async (parentId, data) => {
    const response = await api.post(`${BASE}/${parentId}/section-work-orders`, data);
    return response.data.data;
};

export const updateSectionConfig = async (parentId, data) => {
    const response = await api.patch(`${BASE}/${parentId}/section-config`, data);
    return response.data.data;
};

export const cancelSectionWorkOrder = async (id) => {
    const response = await api.patch(`${BASE}/${id}/cancel`);
    return response.data.data;
};

export const addMaterialLater = async (id, materialId, data) => {
    const response = await api.post(`${BASE}/${id}/materials/${materialId}/add-later`, data);
    return response.data.data;
};

export const createSupplementaryWorkOrder = async (sectionId, data) => {
    const response = await api.post(`${BASE}/${sectionId}/supplementary-work-orders`, data);
    return response.data.data;
};
