import api from './api';

export const getBOMs = async (params) => {
    const response = await api.get('/boms', { params });
    return response.data;
};

export const getBOM = async (id) => {
    const response = await api.get(`/boms/${id}`);
    return response.data.data;
};

export const createBOM = async (data) => {
    const response = await api.post('/boms', data);
    return response.data.data;
};

export const updateBOM = async (id, data) => {
    const response = await api.put(`/boms/${id}`, data);
    return response.data.data;
};

export const deleteBOM = async (id) => {
    const response = await api.delete(`/boms/${id}`);
    return response.data;
};

export const exportBOMTemplate = async () => {
    const response = await api.get('/boms/export/template', { responseType: 'blob' });
    return response.data;
};

export const importBOMsExcel = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/boms/import/excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

export const exportBOMList = async (params) => {
    const response = await api.get('/boms/export/list', { params, responseType: 'blob' });
    return response.data;
};

export const exportBOM = async (id) => {
    const response = await api.get(`/boms/${id}/export`, { responseType: 'blob' });
    return response.data;
};
