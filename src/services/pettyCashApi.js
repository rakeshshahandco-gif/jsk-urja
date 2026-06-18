import apiClient from './api';

const unwrap = (res) => res.data?.data ?? res.data;

export const pettyCashApi = {
    getSettings: async (financialYear) => {
        const res = await apiClient.get('/petty-cash/settings', { params: { financialYear } });
        return unwrap(res);
    },
    saveSettings: async (body) => {
        const res = await apiClient.put('/petty-cash/settings', body);
        return unwrap(res);
    },
    listLedgers: async () => {
        const res = await apiClient.get('/petty-cash/ledgers');
        return unwrap(res)?.results || [];
    },
    listEntries: async (params = {}) => {
        const res = await apiClient.get('/petty-cash/entries', { params });
        return unwrap(res);
    },
    createEntry: async (body) => {
        const res = await apiClient.post('/petty-cash/entries', body);
        return unwrap(res);
    },
    downloadTemplate: async (financialYear) => {
        const res = await apiClient.get('/petty-cash/template', {
            params: { financialYear },
            responseType: 'blob',
            timeout: 120000,
        });
        return res.data;
    },
    exportExpenseLedgers: async () => {
        const res = await apiClient.get('/petty-cash/ledgers/export', { responseType: 'blob' });
        return res.data;
    },
    uploadImport: async (file, financialYear) => {
        const form = new FormData();
        form.append('file', file);
        form.append('financialYear', financialYear);
        const res = await apiClient.post('/petty-cash/import', form, {
            // First import can be slow (Excel parse + DB indexes); default api timeout is 10s.
            timeout: 120000,
            transformRequest: [(data, headers) => {
                delete headers['Content-Type'];
                return data;
            }],
        });
        return unwrap(res);
    },
    approveImport: async (batchId, rowNumbers) => {
        const body = rowNumbers?.length ? { rowNumbers } : {};
        const res = await apiClient.post(`/petty-cash/import/${batchId}/approve`, body, {
            timeout: 120000,
        });
        return unwrap(res);
    },
    getReport: async (params = {}) => {
        const res = await apiClient.get('/petty-cash/reports', { params });
        return unwrap(res);
    },
    exportReport: async (params = {}) => {
        const res = await apiClient.get('/petty-cash/reports/export', {
            params,
            responseType: 'blob',
        });
        return res.data;
    },
    attachFile: async (entryId, file, label = '') => {
        const form = new FormData();
        form.append('file', file);
        if (label) form.append('label', label);
        const res = await apiClient.post(`/petty-cash/entries/${entryId}/attach`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return unwrap(res);
    },
};

export default pettyCashApi;
