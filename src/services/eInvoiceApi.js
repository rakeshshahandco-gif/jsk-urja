import api from './api';

export const createEInvoiceDraft = async (invoiceId) => {
    const response = await api.post('/e-invoices', { invoiceId });
    return response.data;
};

export const getEInvoices = async (params) => {
    const response = await api.get('/e-invoices', { params });
    return response.data;
};

export const getEInvoiceById = async (id) => {
    const response = await api.get(`/e-invoices/${id}`);
    return response.data;
};

export const updateEInvoiceDraft = async (id, data) => {
    const response = await api.patch(`/e-invoices/${id}`, data);
    return response.data;
};

export const refreshEInvoiceFromInvoice = async (id, force = false) => {
    const response = await api.post(`/e-invoices/${id}/refresh-invoice`, force ? { force: true } : {});
    return response.data;
};

export const exportEInvoiceJson = async (id) => {
    const response = await api.get(`/e-invoices/${id}/export-json`);
    return response.data;
};

export const validateEInvoice = async (id) => {
    const response = await api.get(`/e-invoices/${id}/validate`);
    return response.data;
};

export const generateEInvoiceIrn = async (id) => {
    const response = await api.post(`/e-invoices/${id}/generate-irn`);
    return response.data;
};

export const recordEInvoiceIrnManual = async (id, data) => {
    const response = await api.post(`/e-invoices/${id}/record-irn`, data);
    return response.data;
};

export const deleteEInvoiceDraft = async (id) => {
    const response = await api.delete(`/e-invoices/${id}`);
    return response.data;
};
