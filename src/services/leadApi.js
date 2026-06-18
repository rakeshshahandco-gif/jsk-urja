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
    visibilityMeta: async () => {
        const res = await apiClient.get('/leads/visibility-meta');
        return res.data?.data;
    },
    report: async (params = {}) => {
        const res = await apiClient.get('/leads/report', { params });
        return res.data?.data;
    },
    exportReportExcel: async (params = {}) => {
        const res = await apiClient.get('/leads/report/export/excel', {
            params,
            responseType: 'blob',
        });
        return res.data;
    },
    tasks: async (id) => {
        const res = await apiClient.get(`/leads/${id}/tasks`);
        return res.data?.data;
    },
    createTask: async (id, body = {}) => {
        const res = await apiClient.post(`/leads/${id}/create-task`, body);
        return res.data?.data;
    },
};

export default leadApi;
