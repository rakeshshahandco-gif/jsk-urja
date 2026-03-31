import api from './api';

export const getFinancialYears = async () => {
    const response = await api.get('/financial-years');
    return response.data;
};

export const getFinancialYearById = async (id) => {
    const response = await api.get(`/financial-years/${id}`);
    return response.data;
};

export const createFinancialYear = async (data) => {
    const response = await api.post('/financial-years', data);
    return response.data;
};

export const updateFinancialYear = async (id, data) => {
    const response = await api.patch(`/financial-years/${id}`, data);
    return response.data;
};

export const deleteFinancialYear = async (id) => {
    const response = await api.delete(`/financial-years/${id}`);
    return response.data;
};

export const setCurrentFinancialYear = async (id) => {
    const response = await api.post(`/financial-years/${id}/current`);
    return response.data;
};
