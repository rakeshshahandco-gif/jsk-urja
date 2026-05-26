import { apiClient } from '@/lib/apiClient';

export const getBillWiseWorkspace = (params) =>
    apiClient.get('/bill-wise-adjustment/workspace', { params }).then((r) => r.data.data);

export const postBillWiseFifoPreview = (body) =>
    apiClient.post('/bill-wise-adjustment/fifo-preview', body).then((r) => r.data.data);

export const applyBillWiseAdjustments = (body) =>
    apiClient.post('/bill-wise-adjustment/apply', body).then((r) => r.data.data);

export const getBillWiseHistory = (params) =>
    apiClient.get('/bill-wise-adjustment/history', { params }).then((r) => r.data.data);

export const getBillAdjustments = (params) =>
    apiClient.get('/bill-wise-adjustment/for-bill', { params }).then((r) => r.data.data);

export const reverseBillWiseAdjustment = (id, body) =>
    apiClient.post(`/bill-wise-adjustment/${id}/reverse`, body).then((r) => r.data.data);
