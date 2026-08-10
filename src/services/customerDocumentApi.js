import api from './api';

const BASE = '/customer-documents';

export async function getCustomerKycMeta() {
    const res = await api.get(`${BASE}/kyc-meta`);
    return res.data?.data ?? res.data;
}

export async function listCustomerDocuments(customerId, params = {}) {
    const res = await api.get(`${BASE}/${customerId}`, { params });
    return res.data?.data?.results ?? res.data?.results ?? [];
}

export async function uploadCustomerDocument(customerId, formData) {
    // Let the browser/axios set multipart boundary — do NOT force Content-Type
    // (missing boundary drops FormData fields like documentType).
    const res = await api.post(`${BASE}/${customerId}/upload`, formData, {
        headers: { 'Content-Type': undefined },
        transformRequest: [
            (data, headers) => {
                if (typeof FormData !== 'undefined' && data instanceof FormData) {
                    if (headers && typeof headers.delete === 'function') {
                        headers.delete('Content-Type');
                    } else if (headers) {
                        delete headers['Content-Type'];
                        delete headers['content-type'];
                    }
                }
                return data;
            },
        ],
    });
    return res.data?.data ?? res.data;
}

export async function replaceCustomerDocument(documentId, formData) {
    const res = await api.put(`${BASE}/file/${documentId}/replace`, formData, {
        headers: { 'Content-Type': undefined },
        transformRequest: [
            (data, headers) => {
                if (typeof FormData !== 'undefined' && data instanceof FormData) {
                    if (headers && typeof headers.delete === 'function') {
                        headers.delete('Content-Type');
                    } else if (headers) {
                        delete headers['Content-Type'];
                        delete headers['content-type'];
                    }
                }
                return data;
            },
        ],
    });
    return res.data?.data ?? res.data;
}

export async function deleteCustomerDocument(documentId) {
    const res = await api.delete(`${BASE}/file/${documentId}`);
    return res.data;
}

export async function updateCustomerDocumentMeta(documentId, body) {
    const res = await api.patch(`${BASE}/file/${documentId}`, body);
    return res.data?.data ?? res.data;
}

export function getCustomerDocumentDownloadUrl(fileUrl) {
    if (!fileUrl) return '';
    if (fileUrl.startsWith('http')) return fileUrl;
    const base = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    const origin = base.replace(/\/api\/v1\/?$/, '');
    return `${origin}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
}

export async function fetchMissingDocumentReport(documentType, params = {}) {
    const res = await api.get(`${BASE}/reports/missing/${documentType}`, { params });
    return res.data?.data ?? res.data;
}

export async function fetchExpiringDocumentsReport(params = {}) {
    const res = await api.get(`${BASE}/reports/expiring`, { params });
    return res.data?.data ?? res.data;
}

export async function fetchMissingKycSummary(params = {}) {
    const res = await api.get(`${BASE}/reports/missing-kyc`, { params });
    return res.data?.data ?? res.data;
}
