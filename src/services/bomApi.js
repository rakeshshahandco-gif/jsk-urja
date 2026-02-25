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
