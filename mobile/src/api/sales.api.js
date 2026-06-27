import apiClient from './client';
import { extractList } from '../utils/apiResponse';

export const salesApi = {
  getInvoices: async (params = {}) => {
    const response = await apiClient.get('/sales-invoices', { params });
    const body = response.data?.data ?? response.data;
    const invoices = extractList(body, ['invoices']);
    return {
      invoices,
      total: body?.total ?? invoices.length,
      page: body?.page,
      limit: body?.limit,
    };
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
    const body = response.data?.data ?? response.data;
    const salesOrders = extractList(body, ['salesOrders', 'orders']);
    return {
      salesOrders,
      total: body?.total ?? salesOrders.length,
      page: body?.page,
      limit: body?.limit,
    };
  },

  getSalesOrder: async (id) => {
    const response = await apiClient.get(`/sales-orders/${id}`);
    return response.data?.data || response.data;
  },

  createSalesOrder: async (data) => {
    const response = await apiClient.post('/sales-orders', data);
    return response.data?.data || response.data;
  },

  getSeries: async (params = { active: true }) => {
    const response = await apiClient.get('/invoice-series', { params });
    const body = response.data?.data ?? response.data;
    return extractList(body, ['series', 'results', 'data']);
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
