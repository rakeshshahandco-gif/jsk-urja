import api from './api';

const unwrap = (res) => res.data?.data ?? res.data;

const toFormDataSingle = (file, moduleType, financialYear, postingMode) => {
    const form = new FormData();
    form.append('file', file);
    form.append('moduleType', moduleType);
    form.append('financialYear', financialYear);
    if (moduleType === 'purchase_invoice' && postingMode) {
        form.append('postingMode', postingMode);
    }
    return form;
};

const toFormDataBulk = (files, moduleType, financialYear, postingMode) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    form.append('moduleType', moduleType);
    form.append('financialYear', financialYear);
    if (moduleType === 'purchase_invoice' && postingMode) {
        form.append('postingMode', postingMode);
    }
    return form;
};

export const scanEntryApi = {
    upload: async ({ file, moduleType, financialYear, postingMode }) => {
        const res = await api.post('/scan-entry/upload', toFormDataSingle(file, moduleType, financialYear, postingMode), {
            timeout: 120000,
            transformRequest: [(data, headers) => {
                delete headers['Content-Type'];
                return data;
            }],
        });
        return unwrap(res);
    },

    bulkUpload: async ({ files, moduleType, financialYear, postingMode }) => {
        const res = await api.post('/scan-entry/bulk-upload', toFormDataBulk(files, moduleType, financialYear, postingMode), {
            timeout: 120000,
            transformRequest: [(data, headers) => {
                delete headers['Content-Type'];
                return data;
            }],
        });
        return unwrap(res);
    },

    listDrafts: async (params = {}) => {
        const res = await api.get('/scan-entry/drafts', { params });
        return unwrap(res);
    },

    getDraft: async (id) => {
        const res = await api.get(`/scan-entry/drafts/${id}`, { timeout: 120000 });
        return unwrap(res);
    },

    updateDraft: async (id, body) => {
        const res = await api.patch(`/scan-entry/drafts/${id}`, body);
        return unwrap(res);
    },

    matchSupplier: async (id, supplierId) => {
        const res = await api.post(`/scan-entry/drafts/${id}/match-supplier`, { supplierId }, { timeout: 120000 });
        return unwrap(res);
    },

    rematchMaster: async (id, extractedData) => {
        const res = await api.post(`/scan-entry/drafts/${id}/rematch-master`, extractedData ? { extractedData } : {}, { timeout: 120000 });
        return unwrap(res);
    },

    matchItems: async (id, mappedItems, saveAlias = false) => {
        const res = await api.post(`/scan-entry/drafts/${id}/match-items`, { mappedItems, saveAlias }, { timeout: 120000 });
        return unwrap(res);
    },

    validateDraft: async (id) => {
        const res = await api.post(`/scan-entry/drafts/${id}/validate`, {}, { timeout: 120000 });
        return unwrap(res);
    },

    saveDraft: async (id, body = {}) => {
        const res = await api.post(`/scan-entry/drafts/${id}/save-draft`, body, { timeout: 120000 });
        return unwrap(res);
    },

    postDraft: async (id) => {
        const res = await api.post(`/scan-entry/drafts/${id}/post`, {}, { timeout: 120000 });
        return unwrap(res);
    },

    repostLedger: async (draftId) => {
        const res = await api.post(`/scan-entry/drafts/${draftId}/repost-ledger`, {}, { timeout: 120000 });
        return unwrap(res);
    },

    repostPurchaseLedger: async (invoiceId) => {
        const res = await api.post(`/scan-entry/linked-purchase-invoices/${invoiceId}/repost-ledger`, {}, { timeout: 120000 });
        return unwrap(res);
    },

    rejectDraft: async (id, remark) => {
        const res = await api.post(`/scan-entry/drafts/${id}/reject`, { remark });
        return unwrap(res);
    },

    overrideDuplicate: async (id, reason) => {
        const res = await api.post(`/scan-entry/drafts/${id}/override-duplicate`, { reason });
        return unwrap(res);
    },

    createDraftSupplier: async (id) => {
        const res = await api.post(`/scan-entry/drafts/${id}/create-draft-supplier`);
        return unwrap(res);
    },

    approvePendingMaster: async (id, masterIndex = 0) => {
        const res = await api.post(`/scan-entry/drafts/${id}/approve-pending-master`, { masterIndex });
        return unwrap(res);
    },

    deleteDraft: async (id) => {
        const res = await api.delete(`/scan-entry/drafts/${id}`);
        return unwrap(res);
    },

    listItems: async (search = '') => {
        const res = await api.get('/scan-entry/items', { params: { search } });
        return unwrap(res)?.results || [];
    },

    listKeywordMaps: async () => {
        const res = await api.get('/scan-entry/keyword-maps');
        return unwrap(res)?.results || [];
    },

    saveKeywordMap: async (body) => {
        const res = await api.post('/scan-entry/keyword-maps', body);
        return unwrap(res);
    },

    deleteKeywordMap: async (id) => {
        const res = await api.delete(`/scan-entry/keyword-maps/${id}`);
        return unwrap(res);
    },

    getReportSummary: async () => {
        const res = await api.get('/scan-entry/reports/summary');
        return unwrap(res);
    },
};

