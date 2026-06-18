import api from './api';

export const listCompanies = async () => {
    const res = await api.get('/companies');
    return res.data.data || [];
};

export const getCompanyById = async (companyId) => {
    const res = await api.get(`/companies/${companyId}`);
    return res.data.data;
};

export const updateCompanyRecord = async (companyId, payload) => {
    const res = await api.put(`/companies/${companyId}`, payload);
    return res.data.data;
};

export const createCompanyRecord = async (payload) => {
    const res = await api.post('/companies', payload);
    return res.data.data;
};
