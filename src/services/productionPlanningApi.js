import api from './api';

export const productionPlanningApi = {
    calculateMRP: async (data) => {
        const response = await api.post('/production-planning/calculate', data);
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
