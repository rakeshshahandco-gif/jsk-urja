import apiClient from './api';

const unwrap = (res) => res.data?.data ?? res.data;

export const voucherAttachmentApi = {
    listByVoucher: async (voucherType, voucherId) => {
        const res = await apiClient.get(`/voucher-attachments/voucher/${voucherType}/${voucherId}`);
        return unwrap(res)?.results || [];
    },

    searchVouchers: async (params = {}) => {
        const res = await apiClient.get('/voucher-attachments/search', { params });
        return unwrap(res);
    },

    missingReport: async (params = {}) => {
        const res = await apiClient.get('/voucher-attachments/missing', { params });
        return unwrap(res);
    },

    summaryStats: async () => {
        const res = await apiClient.get('/voucher-attachments/summary');
        return unwrap(res);
    },

    upload: async ({ file, voucherType, voucherId, source = 'upload', label = '' }) => {
        const form = new FormData();
        form.append('file', file);
        form.append('voucherType', voucherType);
        form.append('voucherId', voucherId);
        form.append('source', source);
        if (label) form.append('label', label);
        const res = await apiClient.post('/voucher-attachments/upload', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return unwrap(res);
    },

    remove: async (id) => {
        const res = await apiClient.delete(`/voucher-attachments/${id}`);
        return unwrap(res);
    },
};

export default voucherAttachmentApi;
