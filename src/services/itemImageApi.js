import api from './api';

const BASE = '/item-images';

export async function listItemImages(itemId, params = {}) {
    const res = await api.get(`${BASE}/${itemId}`, { params });
    return res.data?.data?.results ?? res.data?.results ?? [];
}

export async function uploadItemImage(itemId, formData) {
    const res = await api.post(`${BASE}/${itemId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.data ?? res.data;
}

export async function replaceItemImage(imageId, formData) {
    const res = await api.put(`${BASE}/file/${imageId}/replace`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.data ?? res.data;
}

export async function deleteItemImage(imageId, params = {}) {
    const res = await api.delete(`${BASE}/file/${imageId}`, { params });
    return res.data;
}

export async function getItemImageEligibility(companyId) {
    const res = await api.get(`${BASE}/eligibility`, { params: { companyId } });
    return res.data?.data ?? res.data;
}

export function getItemImageDownloadUrl(fileUrl) {
    if (!fileUrl) return '';
    if (fileUrl.startsWith('http')) return fileUrl;
    const base = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    const origin = base.replace(/\/api\/v1\/?$/, '');
    return `${origin}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
}

export function isImageFileType(mime = '', fileName = '') {
    if (/^image\//i.test(mime)) return true;
    return /\.(jpe?g|png|webp|gif)$/i.test(fileName || '');
}
