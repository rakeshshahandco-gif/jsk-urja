import { apiClient } from '../lib/apiClient';

export const leadApi = {
    list: async (params = {}) => {
        const res = await apiClient.get('/leads', { params });
        return res.data?.data;
    },
    get: async (id) => {
        const res = await apiClient.get(`/leads/${id}`);
        return res.data?.data;
    },
    create: async (body) => {
        const res = await apiClient.post('/leads', body);
        return res.data?.data;
    },
    update: async (id, body) => {
        const res = await apiClient.patch(`/leads/${id}`, body);
        return res.data?.data;
    },
    remove: async (id) => {
        const res = await apiClient.delete(`/leads/${id}`);
        return res.data?.data;
    },
    fromWhatsApp: async (body) => {
        const res = await apiClient.post('/leads/from-whatsapp', body);
        return res.data?.data;
    },
    shareAsset: async (id, body) => {
        const res = await apiClient.post(`/leads/${id}/share-asset`, body);
        return res.data?.data;
    },
    activities: async (id, params = {}) => {
        const res = await apiClient.get(`/leads/${id}/activities`, { params });
        return res.data?.data;
    },
};

export default leadApi;
