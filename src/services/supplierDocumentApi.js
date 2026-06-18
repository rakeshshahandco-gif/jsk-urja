import api from './api';

const BASE = '/supplier-documents';

export async function getSupplierKycMeta() {
    const res = await api.get(`${BASE}/kyc-meta`);
    return res.data?.data ?? res.data;
}

export async function listSupplierDocuments(supplierId, params = {}) {
    const res = await api.get(`${BASE}/${supplierId}`, { params });
    return res.data?.data?.results ?? res.data?.results ?? [];
}

export async function uploadSupplierDocument(supplierId, formData) {
    const res = await api.post(`${BASE}/${supplierId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.data ?? res.data;
}

export async function replaceSupplierDocument(documentId, formData) {
    const res = await api.put(`${BASE}/file/${documentId}/replace`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.data ?? res.data;
}

export async function deleteSupplierDocument(documentId) {
    const res = await api.delete(`${BASE}/file/${documentId}`);
    return res.data;
}

export function getSupplierDocumentDownloadUrl(fileUrl) {
    if (!fileUrl) return '';
    if (fileUrl.startsWith('http')) return fileUrl;
    const base = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    return `${base.replace(/\/$/, '')}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
}

export async function fetchMissingSupplierDocumentReport(documentType, params = {}) {
    const res = await api.get(`${BASE}/reports/missing/${documentType}`, { params });
    return res.data?.data ?? res.data;
}

export async function fetchExpiringSupplierDocumentsReport(params = {}) {
    const res = await api.get(`${BASE}/reports/expiring`, { params });
    return res.data?.data ?? res.data;
}
