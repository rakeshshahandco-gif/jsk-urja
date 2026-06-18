import api from './api';

const unwrap = (res) => res.data?.data ?? res.data;

export const smartImportApi = {
    upload: async ({ file, importType, financialYear, dryRun = false }) => {
        const form = new FormData();
        form.append('file', file);
        form.append('importType', importType);
        form.append('financialYear', financialYear);
        if (dryRun) form.append('dryRun', 'true');
        const res = await api.post('/smart-import/upload', form, {
            timeout: 120000,
            transformRequest: [(data, headers) => {
                delete headers['Content-Type'];
                return data;
            }],
        });
        return unwrap(res);
    },

    getBatch: async (batchId) => {
        const res = await api.get(`/smart-import/batches/${batchId}`);
        return unwrap(res);
    },

    listBatches: async (params = {}) => {
        const res = await api.get('/smart-import/batches', { params });
        return unwrap(res);
    },

    approve: async (batchId, rowNumbers) => {
        const res = await api.post(`/smart-import/batches/${batchId}/approve`, { rowNumbers }, { timeout: 120000 });
        return unwrap(res);
    },
};
