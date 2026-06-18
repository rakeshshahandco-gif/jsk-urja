import api from './api';

export const getTextileProcessOutputEligibility = async (companyId) => {
    const res = await api.get('/textile-process-output/eligibility', { params: companyId ? { companyId } : {} });
    return res.data.data;
};

export const listAvailableProcessOutput = async (params = {}) => {
    const res = await api.get('/textile-process-output/available', { params });
    return res.data.data || [];
};

export const listProcessOutputStock = async (params = {}) => {
    const res = await api.get('/textile-process-output/stock', { params });
    return res.data.data || [];
};

export const getProcessOutputSummary = async (companyId) => {
    const res = await api.get('/textile-process-output/summary', { params: companyId ? { companyId } : {} });
    return res.data.data || [];
};

export const getProcessTraceByBarcode = async (barcode, companyId) => {
    const res = await api.get('/textile-process-output/trace', { params: { barcode, ...(companyId ? { companyId } : {}) } });
    return res.data.data || [];
};

export const listProcessHistory = async (params = {}) => {
    const res = await api.get('/textile-process-output/history', { params });
    return res.data.data || [];
};

export const getPendingNextProcessReport = async (params = {}) => {
    const res = await api.get('/textile-process-output/reports/pending-next-process', { params });
    return res.data.data || [];
};

export const getFinishedGoodsTransferReport = async (params = {}) => {
    const res = await api.get('/textile-process-output/reports/fg-transfers', { params });
    return res.data.data || [];
};

export const getTextileDemoStatus = async (companyId) => {
    const res = await api.get('/textile-process-output/demo/status', { params: companyId ? { companyId } : {} });
    return res.data.data;
};

export const seedTextileDemo = async (companyId) => {
    const res = await api.post('/textile-process-output/demo/seed', companyId ? { companyId } : {});
    return res.data.data;
};

export const previewTextileDemoTransfer = async (payload) => {
    const res = await api.post('/textile-process-output/demo/preview', payload);
    return res.data.data;
};

export const executeTextileDemoTransfer = async (payload) => {
    const res = await api.post('/textile-process-output/demo/transfer', payload);
    return res.data.data;
};

export const resetTextileDemo = async (companyId) => {
    const res = await api.post('/textile-process-output/demo/reset', companyId ? { companyId } : {});
    return res.data.data;
};
