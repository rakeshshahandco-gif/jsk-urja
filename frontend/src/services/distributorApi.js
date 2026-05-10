import api from './api';

export const getDistributors = async (params) => {
    const response = await api.get('/distributors', { params });
    return response.data;
};

export const getDistributor = async (id) => {
    const response = await api.get(`/distributors/${id}`);
    return response.data;
};

export const createDistributor = async (data) => {
    const response = await api.post('/distributors', data);
    return response.data;
};

export const updateDistributor = async (id, data) => {
    const response = await api.patch(`/distributors/${id}`, data);
    return response.data;
};

export const deleteDistributor = async (id) => {
    const response = await api.delete(`/distributors/${id}`);
    return response.data;
};
