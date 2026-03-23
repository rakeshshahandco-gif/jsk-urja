import apiClient from './api';

// ─── SALES ORDERS ─────────────────────────────────────────────────────────────

export const getSalesOrders = (params = {}) =>
    apiClient.get('/sales-orders', { params }).then(r => r.data);

export const getSalesOrderById = (id) =>
    apiClient.get(`/sales-orders/${id}`).then(r => r.data.data);

export const createSalesOrder = (data) =>
    apiClient.post('/sales-orders', data).then(r => r.data.data);

export const updateSalesOrder = (id, data) =>
    apiClient.put(`/sales-orders/${id}`, data).then(r => r.data.data);

export const cancelSalesOrder = (id) =>
    apiClient.post(`/sales-orders/${id}/cancel`).then(r => r.data);

export const deleteSalesOrder = (id) =>
    apiClient.delete(`/sales-orders/${id}`).then(r => r.data);


export const generateProductionSheet = (soId) =>
    apiClient.post(`/sales-orders/${soId}/generate-production-sheet`).then(r => r.data);

// ─── SALES INVOICES ───────────────────────────────────────────────────────────

export const getSalesInvoices = (params = {}) =>
    apiClient.get('/sales-invoices', { params }).then(r => r.data);

export const getSalesInvoiceById = (id) =>
    apiClient.get(`/sales-invoices/${id}`).then(r => r.data.data);

export const createSalesInvoice = (data) =>
    apiClient.post('/sales-invoices', data).then(r => r.data.data);

export const cancelSalesInvoice = (id) =>
    apiClient.post(`/sales-invoices/${id}/cancel`).then(r => r.data);

export const recordSalesPayment = (id, data) =>
    apiClient.post(`/sales-invoices/${id}/record-payment`, data).then(r => r.data);

// ─── INVOICE SERIES ───────────────────────────────────────────────────────────

export const getInvoiceSeries = (params = {}) =>
    apiClient.get('/invoice-series', { params }).then(r => r.data.series);

export const getInvoiceSeriesById = (id) =>
    apiClient.get(`/invoice-series/${id}`).then(r => r.data.data);

export const createInvoiceSeries = (data) =>
    apiClient.post('/invoice-series', data).then(r => r.data.data);

export const updateInvoiceSeries = (id, data) =>
    apiClient.put(`/invoice-series/${id}`, data).then(r => r.data.data);

export const deleteInvoiceSeries = (id) =>
    apiClient.delete(`/invoice-series/${id}`).then(r => r.data);

// ─── PRODUCTION SHEETS ────────────────────────────────────────────────────────

export const getProductionSheetById = (id) =>
    apiClient.get(`/production-sheets/${id}`).then(r => r.data.data);

export const getProductionSheetBySOId = (soId) =>
    apiClient.get(`/production-sheets/by-so/${soId}`).then(r => r.data.data);

export const updateProductionSheet = (id, data) =>
    apiClient.put(`/production-sheets/${id}`, data).then(r => r.data.data);
