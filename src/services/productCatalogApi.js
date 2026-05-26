import { apiClient } from '../lib/apiClient';

export const productCatalogApi = {
    list: async (params = {}) => {
        const res = await apiClient.get('/product-catalog', { params });
        return res.data?.data;
    },
    get: async (id) => {
        const res = await apiClient.get(`/product-catalog/${id}`);
        return res.data?.data;
    },
    create: async (body) => {
        const res = await apiClient.post('/product-catalog', body);
        return res.data?.data;
    },
    update: async (id, body) => {
        const res = await apiClient.patch(`/product-catalog/${id}`, body);
        return res.data?.data;
    },
    remove: async (id) => {
        const res = await apiClient.delete(`/product-catalog/${id}`);
        return res.data?.data;
    },
    uploadAsset: async (id, assetType, file) => {
        const form = new FormData();
        form.append('file', file);
        const res = await apiClient.post(
            `/product-catalog/${id}/upload`,
            form,
            {
                params: { assetType },
                headers: { 'Content-Type': 'multipart/form-data' },
            },
        );
        return res.data?.data;
    },
};

export default productCatalogApi;
