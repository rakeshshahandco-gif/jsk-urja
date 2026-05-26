import apiClient from './client';

export const salesApi = {
  getInvoices: async (params = {}) => {
    const response = await apiClient.get('/sales-invoices', { params });
    // Structure: { statusCode, data: { invoices: [], meta: {} }, message }
    return response.data?.data || response.data;
  },

  getInvoice: async (id) => {
    const response = await apiClient.get(`/sales-invoices/${id}`);
    return response.data?.data || response.data;
  },

  createInvoice: async (data) => {
    const response = await apiClient.post('/sales-invoices', data);
    return response.data?.data || response.data;
  },

  getSalesOrders: async (params = {}) => {
    const response = await apiClient.get('/sales-orders', { params });
    return response.data?.data || response.data;
  },

  createSalesOrder: async (data) => {
    const response = await apiClient.post('/sales-orders', data);
    return response.data?.data || response.data;
  },

  getSeries: async (params = { active: true }) => {
    const response = await apiClient.get('/invoice-series', { params });
    return response.data?.data || response.data;
  },

  previewNextNo: async (seriesId, module) => {
    const response = await apiClient.get(`/invoice-series/${seriesId}/preview-next-no`, { params: { module } });
    return response.data?.data || response.data;
  },

  lookupInvoiceByCode: async (code) => {
    const response = await apiClient.get('/sales-invoices/lookup', { params: { code } });
    return response.data?.data || response.data;
  },

  getInvoiceBarcodeData: async (id) => {
    const response = await apiClient.get(`/sales-invoices/${id}/barcode-data`);
    return response.data?.data || response.data;
  },
};
