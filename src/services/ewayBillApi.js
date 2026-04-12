import api from './api';

export const createEwayBillDraft = async (invoiceId) => {
    const response = await api.post('/eway-bills', { invoiceId });
    return response.data;
};

export const getEwayBills = async (params) => {
    const response = await api.get('/eway-bills', { params });
    return response.data;
};

export const getEwayBillById = async (id) => {
    const response = await api.get(`/eway-bills/${id}`);
    return response.data;
};

export const updateEwayBill = async (id, data) => {
    const response = await api.patch(`/eway-bills/${id}`, data);
    return response.data;
};

export const exportEwayBillJson = async (id) => {
    const response = await api.get(`/eway-bills/${id}/export-json`);
    return response.data;
};

export const syncEwayBillWithMaster = async (id) => {
    const response = await api.post(`/eway-bills/${id}/sync-master`);
    return response.data;
};

export const deleteEwayBill = async (id) => {

    const response = await api.delete(`/eway-bills/${id}`);
    return response.data;
};
