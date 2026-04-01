import api from './api';

export const productionPlanningApi = {
    // Single-product MRP (backward compatible)
    calculateMRP: async (data) => {
        const response = await api.post('/production-planning/calculate', data);
        return response.data;
    },

    // Multi-product MRP
    calculateMultiMRP: async (data) => {
        const response = await api.post('/production-planning/calculate-multi', data);
        return response.data;
    },

    // Export shortage data as JSON (frontend converts to XLSX)
    exportShortage: async (data) => {
        const response = await api.post('/production-planning/export-shortage', data);
        return response.data;
    },

    // Convert shortage items to Draft PO
    convertToPO: async (planningId, data) => {
        const response = await api.post(`/production-planning/${planningId}/convert-to-po`, data);
        return response.data;
    },

    getPlannings: async (params) => {
        const response = await api.get('/production-planning', { params });
        return response.data;
    },

    getPlanningById: async (id) => {
        const response = await api.get(`/production-planning/${id}`);
        return response.data;
    },

    createPlanning: async (data) => {
        const response = await api.post('/production-planning', data);
        return response.data;
    },

    updatePlanning: async (id, data) => {
        const response = await api.patch(`/production-planning/${id}`, data);
        return response.data;
    },

    deletePlanning: async (id) => {
        const response = await api.delete(`/production-planning/${id}`);
        return response.data;
    }
};
