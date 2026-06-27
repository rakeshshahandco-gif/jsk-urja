import api from './api';

const unwrap = (res) => res.data?.data ?? res.data;

export const dataExtractorApi = {
    getProviderStatus: async () => {
        const res = await api.get('/data-extractor/provider-status');
        return unwrap(res);
    },

    testWebSearch: async () => {
        const res = await api.post('/data-extractor/provider/test');
        return unwrap(res);
    },

    getSettings: async () => {
        const res = await api.get('/data-extractor/settings');
        return unwrap(res);
    },

    getProviderStatus: async () => {
        const res = await api.get('/data-extractor/provider-status');
        return unwrap(res);
    },

    updateSettings: async (payload) => {
        const res = await api.put('/data-extractor/settings', payload);
        return unwrap(res);
    },

    listSources: async () => {
        const res = await api.get('/data-extractor/sources');
        return unwrap(res);
    },

    listAdapters: async () => {
        const res = await api.get('/data-extractor/adapters');
        return unwrap(res);
    },

    testAdapter: async (adapterId) => {
        const res = await api.post(`/data-extractor/adapters/${adapterId}/test`);
        return unwrap(res);
    },

    runKeywordSearch: async (payload) => {
        const res = await api.post('/data-extractor/jobs/keyword-search', payload, { timeout: 180000 });
        return unwrap(res);
    },

    runManualUrl: async ({ urls, financialYear }) => {
        const res = await api.post('/data-extractor/jobs/manual-url', { urls, financialYear }, { timeout: 120000 });
        return unwrap(res);
    },

    uploadExcel: async ({ file, financialYear, columnMapping }) => {
        const form = new FormData();
        form.append('file', file);
        form.append('financialYear', financialYear);
        if (columnMapping) form.append('columnMapping', JSON.stringify(columnMapping));
        const res = await api.post('/data-extractor/import/excel', form, {
            timeout: 120000,
            transformRequest: [(data, headers) => {
                delete headers['Content-Type'];
                return data;
            }],
        });
        return unwrap(res);
    },

    listJobs: async (params = {}) => {
        const res = await api.get('/data-extractor/jobs', { params });
        return unwrap(res);
    },

    getJob: async (jobId) => {
        const res = await api.get(`/data-extractor/jobs/${jobId}`);
        return unwrap(res);
    },

    saveJobDrafts: async (jobId, payload) => {
        const res = await api.post(`/data-extractor/jobs/${jobId}/save-drafts`, payload);
        return unwrap(res);
    },

    rerunJob: async (jobId, payload = {}) => {
        const res = await api.post(`/data-extractor/jobs/${jobId}/rerun`, payload, { timeout: 180000 });
        return unwrap(res);
    },

    enhanceJobAi: async (jobId) => {
        const res = await api.post(`/data-extractor/jobs/${jobId}/enhance-ai`, {}, { timeout: 120000 });
        return unwrap(res);
    },

    listRecords: async (params = {}) => {
        const res = await api.get('/data-extractor/records', { params });
        return unwrap(res);
    },

    getRecord: async (id) => {
        const res = await api.get(`/data-extractor/records/${id}`);
        return unwrap(res);
    },

    getRecordDuplicates: async (id) => {
        const res = await api.get(`/data-extractor/records/${id}/duplicates`);
        return unwrap(res);
    },

    scheduleFollowup: async (id, payload) => {
        const res = await api.post(`/data-extractor/records/${id}/followup`, payload);
        return unwrap(res);
    },

    deleteDraft: async (id) => {
        const res = await api.delete(`/data-extractor/records/${id}`);
        return unwrap(res);
    },

    bulkAction: async ({ action, ids, reason, entityType }) => {
        const res = await api.post('/data-extractor/records/bulk', { action, ids, reason, entityType });
        return unwrap(res);
    },

    approveRecord: async (id) => {
        const res = await api.post(`/data-extractor/records/${id}/approve`);
        return unwrap(res);
    },

    rejectRecord: async (id, reason) => {
        const res = await api.post(`/data-extractor/records/${id}/reject`, { reason });
        return unwrap(res);
    },

    convertToLead: async (id) => {
        const res = await api.post(`/data-extractor/records/${id}/convert/lead`);
        return unwrap(res);
    },

    convertToCustomer: async (id) => {
        const res = await api.post(`/data-extractor/records/${id}/convert/customer`);
        return unwrap(res);
    },

    convertToSupplier: async (id) => {
        const res = await api.post(`/data-extractor/records/${id}/convert/supplier`);
        return unwrap(res);
    },

    exportRecords: async (params = {}) => {
        const res = await api.get('/data-extractor/records/export', {
            params,
            responseType: params.format === 'json' ? 'json' : 'blob',
        });
        if (params.format === 'json') return unwrap(res);
        return res.data;
    },
};
