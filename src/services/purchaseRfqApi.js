import api from './api';

const base = '/purchase-rfqs';

const unwrap = (r) => r.data?.data ?? r.data;

export const getPurchaseRfqs = (params = {}) =>
    api.get(base, { params }).then(unwrap);

export const getPurchaseRfqById = (id) =>
    api.get(`${base}/${id}`).then(unwrap);

export const createPurchaseRfq = (data) =>
    api.post(base, data).then(unwrap);

export const updatePurchaseRfq = (id, data) =>
    api.put(`${base}/${id}`, data).then(unwrap);

export const sendPurchaseRfq = (id) =>
    api.post(`${base}/${id}/send`).then(unwrap);

export const cancelPurchaseRfq = (id, data) =>
    api.post(`${base}/${id}/cancel`, data).then(unwrap);

export const getRfqComparison = (id) =>
    api.get(`${base}/${id}/comparison`).then(unwrap);

export const saveRfqSelection = (id, data) =>
    api.put(`${base}/${id}/selection`, data).then(unwrap);

export const approvePurchaseRfq = (id, data) =>
    api.post(`${base}/${id}/approve`, data).then(unwrap);

export const convertRfqToPo = (id) =>
    api.post(`${base}/${id}/convert-to-po`).then(unwrap);

export const getSupplierQuotations = (params = {}) =>
    api.get(`${base}/quotations`, { params }).then(unwrap);

export const getSupplierQuotationById = (id) =>
    api.get(`${base}/quotations/${id}`).then(unwrap);

export const upsertSupplierQuotation = (data) =>
    api.post(`${base}/quotations`, data).then(unwrap);

export const getRfqReports = (params = {}) =>
    api.get(`${base}/reports`, { params }).then(unwrap);
