import api from './api';

// ── Suppliers ──────────────────────────────────────────────────────────────────
const SUP = '/suppliers';
export const getSuppliers = async (params) => { const r = await api.get(SUP, { params }); return r.data.data; };
export const getSupplierById = async (id) => { const r = await api.get(`${SUP}/${id}`); return r.data.data; };
export const createSupplier = async (data) => { const r = await api.post(SUP, data); return r.data.data; };
export const updateSupplier = async (id, data) => { const r = await api.put(`${SUP}/${id}`, data); return r.data.data; };
export const deleteSupplier = async (id) => { const r = await api.delete(`${SUP}/${id}`); return r.data; };
export const importSuppliersExcel = async (formData) => { const r = await api.post(`${SUP}/import/excel`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }); return r.data; };
export const downloadSupplierTemplate = async () => { const r = await api.get(`${SUP}/export/template`, { responseType: 'blob' }); return r.data; };

// ── Purchase Orders ────────────────────────────────────────────────────────────
const PO = '/purchase-orders';
export const getPurchaseOrders = async (params) => { const r = await api.get(PO, { params }); return r.data.data; };
export const getPurchaseOrderById = async (id) => { const r = await api.get(`${PO}/${id}`); return r.data.data; };
export const createPurchaseOrder = async (data) => { const r = await api.post(PO, data); return r.data.data; };
export const updatePurchaseOrder = async (id, data) => { const r = await api.put(`${PO}/${id}`, data); return r.data.data; };
export const updatePOStatus = async (id, status) => { const r = await api.patch(`${PO}/${id}/status`, { status }); return r.data.data; };
export const deletePurchaseOrder = async (id) => { const r = await api.delete(`${PO}/${id}`); return r.data; };

// ── GRN ───────────────────────────────────────────────────────────────────────
const GRN = '/grns';
export const getGRNs = async (params) => { const r = await api.get(GRN, { params }); return r.data.data; };
export const getGRNById = async (id) => { const r = await api.get(`${GRN}/${id}`); return r.data.data; };
export const getGRNsByPO = async (poId) => { const r = await api.get(`${GRN}/by-po/${poId}`); return r.data.data; };
export const getGRNsBySupplier = async (supplierId) => { const r = await api.get(`${GRN}/by-supplier/${supplierId}`); return r.data.data; };
export const createGRN = async (data) => { const r = await api.post(GRN, data); return r.data; };

// ── Purchase Invoices ─────────────────────────────────────────────────────────
const PI = '/purchase-invoices';
export const getPurchaseInvoices = async (params) => { const r = await api.get(PI, { params }); return r.data.data; };
export const getPurchaseInvoiceById = async (id) => { const r = await api.get(`${PI}/${id}`); return r.data.data; };
export const getInvoicesByPO = async (poId) => { const r = await api.get(`${PI}/by-po/${poId}`); return r.data.data; };
export const getInvoicesByGRN = async (grnId) => { const r = await api.get(`${PI}/by-grn/${grnId}`); return r.data.data; };
export const createPurchaseInvoice = async (data) => { const r = await api.post(PI, data); return r.data.data; };
export const updateInvoicePayment = async (id, data) => { const r = await api.patch(`${PI}/${id}/payment`, data); return r.data.data; };
export const confirmPurchaseInvoice = async (id) => { const r = await api.patch(`${PI}/${id}/confirm`); return r.data.data; };
export const cancelPurchaseInvoice = async (id) => { const r = await api.patch(`${PI}/${id}/cancel`); return r.data.data; };
export const updatePurchaseInvoice = async (id, data) => { const r = await api.put(`${PI}/${id}`, data); return r.data.data; };
export const deletePurchaseInvoice = async (id) => { const r = await api.delete(`${PI}/${id}`); return r.data; };

// ── Payment Entries ───────────────────────────────────────────────────────────
const PE = '/payment-entries';
export const createPaymentEntry = async (data) => { const r = await api.post(PE, data); return r.data.data; };
export const getPaymentsByInvoice = async (invoiceId) => { const r = await api.get(`${PE}/by-invoice/${invoiceId}`); return r.data.data; };
export const getCashBook = async (params) => { const r = await api.get(`${PE}/cash-book`, { params }); return r.data.data; };
export const getBankBook = async (params) => { const r = await api.get(`${PE}/bank-book`, { params }); return r.data.data; };

// ── Purchase Comparison Report ────────────────────────────────────────────────
export const getPurchaseComparisonReport = async (params) => { const r = await api.get('/reports/purchase-comparison', { params }); return r.data.data; };
