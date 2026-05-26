import api from './api';

const unwrap = (res) => res.data?.data ?? res.data;

export const gpAnalysisApi = {
    getProductReport: (params) => api.get('/gp-analysis/product', { params }).then(unwrap),
    getCustomerReport: (params) => api.get('/gp-analysis/customer', { params }).then(unwrap),
    getInvoiceReport: (params) => api.get('/gp-analysis/invoice', { params }).then(unwrap),
    getNegativeGpReport: (params) => api.get('/gp-analysis/negative', { params }).then(unwrap),
    getExportDomestic: (params) => api.get('/gp-analysis/export-domestic', { params }).then(unwrap),
    getHighMargin: (params) => api.get('/gp-analysis/high-margin', { params }).then(unwrap),
    getLowMargin: (params) => api.get('/gp-analysis/low-margin', { params }).then(unwrap),
    getCostExceptions: (params) => api.get('/gp-analysis/cost-exceptions', { params }).then(unwrap),
    getDirectorSummary: (params) => api.get('/gp-analysis/director-summary', { params }).then(unwrap),
    getSettings: () => api.get('/gp-analysis/settings').then(unwrap),
    updateSettings: (body) => api.patch('/gp-analysis/settings', body).then(unwrap),
};
