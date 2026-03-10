import api from './api';

// ─── Complaints ───────────────────────────────────────────────────────────────
export const getComplaints = (params = {}) => api.get('/complaints', { params }).then(r => r.data);
export const getComplaint = (id) => api.get(`/complaints/${id}`).then(r => r.data.data);
export const createComplaint = (data) => api.post('/complaints', data).then(r => r.data.data);
export const updateComplaint = (id, data) => api.put(`/complaints/${id}`, data).then(r => r.data.data);
export const deleteComplaint = (id) => api.delete(`/complaints/${id}`).then(r => r.data);

// ─── Replacement Dispatches ───────────────────────────────────────────────────
export const getReplacementDispatches = (params = {}) => api.get('/replacement-dispatches', { params }).then(r => r.data);
export const getReplacementDispatch = (id) => api.get(`/replacement-dispatches/${id}`).then(r => r.data.data);
export const createReplacementDispatch = (data) => api.post('/replacement-dispatches', data).then(r => r.data.data);
export const deleteReplacementDispatch = (id) => api.delete(`/replacement-dispatches/${id}`).then(r => r.data);

// ─── Faulty Receipts ──────────────────────────────────────────────────────────
export const getFaultyReceipts = (params = {}) => api.get('/faulty-receipts', { params }).then(r => r.data);
export const getFaultyReceipt = (id) => api.get(`/faulty-receipts/${id}`).then(r => r.data.data);
export const createFaultyReceipt = (data) => api.post('/faulty-receipts', data).then(r => r.data.data);
export const deleteFaultyReceipt = (id) => api.delete(`/faulty-receipts/${id}`).then(r => r.data);

// ─── Repair Job Cards ─────────────────────────────────────────────────────────
export const getRepairJobCards = (params = {}) => api.get('/repair-job-cards', { params }).then(r => r.data);
export const getRepairJobCard = (id) => api.get(`/repair-job-cards/${id}`).then(r => r.data.data);
export const createRepairJobCard = (data) => api.post('/repair-job-cards', data).then(r => r.data.data);
export const updateRepairJobCard = (id, data) => api.put(`/repair-job-cards/${id}`, data).then(r => r.data.data);
export const deleteRepairJobCard = (id) => api.delete(`/repair-job-cards/${id}`).then(r => r.data);

// ─── Repaired Stock Inwards ───────────────────────────────────────────────────
export const getRepairedStockInwards = (params = {}) => api.get('/repaired-stock-inwards', { params }).then(r => r.data);
export const createRepairedStockInward = (data) => api.post('/repaired-stock-inwards', data).then(r => r.data.data);

// ─── Scrap Entries ────────────────────────────────────────────────────────────
export const getScrapEntries = (params = {}) => api.get('/scrap-entries', { params }).then(r => r.data);
export const createScrapEntry = (data) => api.post('/scrap-entries', data).then(r => r.data.data);
export const deleteScrapEntry = (id) => api.delete(`/scrap-entries/${id}`).then(r => r.data);
