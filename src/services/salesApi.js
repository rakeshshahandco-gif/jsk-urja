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

export const deleteSalesOrder = (id, data) =>
    apiClient.delete(`/sales-orders/${id}`, { data }).then(r => r.data);

export const restoreSalesOrder = (id, data) =>
    apiClient.post(`/sales-orders/${id}/restore`, data).then(r => r.data);


export const generateProductionSheet = (soId) =>
    apiClient.post(`/sales-orders/${soId}/generate-production-sheet`).then(r => r.data);

// ─── SALES INVOICES ───────────────────────────────────────────────────────────

export const getSalesInvoices = (params = {}) =>
    apiClient.get('/sales-invoices', { params }).then(r => r.data);

export const getSalesInvoiceById = (id) =>
    apiClient.get(`/sales-invoices/${id}`).then(r => r.data.data);

export const createSalesInvoice = (data, config = {}) =>
    apiClient.post('/sales-invoices', data, {
        timeout: 120000,
        headers: {
            ...(config.idempotencyKey ? { 'Idempotency-Key': config.idempotencyKey } : {}),
            ...(config.requestId ? { 'X-Request-Id': config.requestId } : {}),
        },
    }).then((r) => r.data);

export const getSalesInvoiceCreationAudit = (params = {}) =>
    apiClient.get('/sales-invoices/creation-audit', { params }).then((r) => r.data);

export const createTaxInvoiceFromSalesOrder = (soId, data, config = {}) =>
    apiClient.post(`/sales-orders/${soId}/create-tax-invoice`, data, {
        timeout: 120000,
        headers: config.idempotencyKey
            ? { 'Idempotency-Key': config.idempotencyKey }
            : undefined,
    }).then(r => r.data.data);

export const cancelSalesInvoice = (id, data) =>
    apiClient.post(`/sales-invoices/${id}/cancel`, data).then(r => r.data);

export const deleteSalesInvoice = (id, data) =>
    apiClient.delete(`/sales-invoices/${id}`, { data }).then(r => r.data);

export const restoreSalesInvoice = async (id) => {
    const response = await apiClient.post(`/sales-invoices/${id}/restore`);
    return response.data;
};

export const updateInvoiceGstDetails = async (id, payload) => {
    const response = await apiClient.post(`/sales-invoices/${id}/gst-correction`, payload);
    return response.data;
};

export const recordSalesPayment = (id, data) =>
    apiClient.post(`/sales-invoices/${id}/record-payment`, data).then(r => r.data);

export const updateIncentiveStatus = (id, data) =>
    apiClient.post(`/sales-invoices/${id}/incentive-status`, data).then(r => r.data);

export const previewCleanupDrafts = (financialYear, seriesId, search) =>
    apiClient.get('admin/cleanup-preview', { params: { financialYear, seriesId, search } }).then(r => r.data.data);

export const executeCleanupDrafts = (data) =>
    apiClient.post('admin/cleanup-execute', data).then(r => r.data);

export const forceCleanupInvoice = (id, reason) =>
    apiClient.delete(`admin/force-cleanup/${id}`, { data: { reason } }).then(r => r.data);

export const renumberInvoice = (id, data) =>
    apiClient.post(`/sales-invoices/renumber/${id}`, data).then(r => r.data);

export const resequenceSeries = (data) =>
    apiClient.post('/sales-invoices/resequence', data).then(r => r.data);

export const changeInvoiceSeries = (id, data) =>
    apiClient.post(`/sales-invoices/change-series/${id}`, data).then(r => r.data);

export const changeInvoiceDate = (id, data) =>
    apiClient.post(`/sales-invoices/${id}/change-date`, data).then(r => r.data);

export const bulkRenumberInvoices = (data) =>
    apiClient.post('/sales-invoices/bulk-renumber', data).then(r => r.data);

export const bulkLockInvoices = (data) =>
    apiClient.post('/sales-invoices/bulk-lock', data).then(r => r.data);

export const getIncentiveReport = (params = {}) =>
    apiClient.get('/sales-invoices/incentive-report', { params }).then(r => r.data.data);

export const getInvoiceBarcodeData = (id) =>
    apiClient.get(`/sales-invoices/${id}/barcode-data`).then(r => r.data.data);

export const lookupInvoiceByCode = (code) =>
    apiClient.get('/sales-invoices/lookup', { params: { code } }).then(r => r.data.data);

export const getInvoiceBarcodeSettings = () =>
    apiClient.get('/sales-invoices/barcode-settings').then(r => r.data.data);

export const updateInvoiceBarcodeSettings = (invoiceBarcodeSettings) =>
    apiClient.put('/sales-invoices/barcode-settings', { invoiceBarcodeSettings }).then(r => r.data.data);

// ─── INVOICE SERIES ───────────────────────────────────────────────────────────

export const getInvoiceSeries = (params = {}) =>
    apiClient.get('/invoice-series', { params }).then(r => r.data.series);

export const getInvoiceSeriesById = (id) =>
    apiClient.get(`/invoice-series/${id}`).then(r => r.data.data);

export const previewNextInvoiceNo = (id, model = 'SalesInvoice') =>
    apiClient.get(`/invoice-series/${id}/preview-next`, { params: { model } }).then(r => r.data);

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
