import api from './api';

const analyticsApi = {
    /**
     * Get Sales & Marketing Dashboard Analytics
     * @param {Object} params - { fromDate, toDate, salesperson, source, product }
     */
    getSalesMarketingDashboard: async (params) => {
        const response = await api.get('/analytics/sales-marketing-dashboard', { params });
        return response.data;
    },

    /**
     * Get Detailed Lead Report
     * @param {Object} params - { fromDate, toDate, salesperson, source, product, stage, page, limit }
     */
    getLeadReport: async (params) => {
        const response = await api.get('/analytics/lead-report', { params });
        return response.data;
    }
};

export default analyticsApi;
