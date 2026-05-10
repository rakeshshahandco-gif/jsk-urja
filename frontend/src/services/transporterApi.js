import api from './api';

export const createTransporter = async (data) => {
    const response = await api.post('/transporters', data);
    return response.data;
};

export const getTransporters = async (params) => {
    const response = await api.get('/transporters', { params });
    return response.data;
};

export const getTransporterById = async (id) => {
    const response = await api.get(`/transporters/${id}`);
    return response.data;
};

export const updateTransporter = async (id, data) => {
    const response = await api.patch(`/transporters/${id}`, data);
    return response.data;
};

export const deleteTransporter = async (id) => {
    const response = await api.delete(`/transporters/${id}`);
    return response.data;
};
