import api from './api';

export const getIndustryTemplates = async (params = {}) => {
    const res = await api.get('/industry-templates', { params });
    return res.data.data || [];
};

export const getIndustryTemplate = async (id) => {
    const res = await api.get(`/industry-templates/${id}`);
    return res.data.data;
};

export const createIndustryTemplate = async (data) => {
    const res = await api.post('/industry-templates', data);
    return res.data.data;
};

export const updateIndustryTemplate = async (id, data) => {
    const res = await api.patch(`/industry-templates/${id}`, data);
    return res.data.data;
};

export const toggleIndustryTemplateActive = async (id) => {
    const res = await api.patch(`/industry-templates/${id}/toggle-active`);
    return res.data.data;
};

export const getDefaultIndustryTemplate = async () => {
    const res = await api.get('/industry-templates/default');
    return res.data.data;
};

export const resolveCompanyIndustryTemplate = async (companyId) => {
    const res = await api.get(`/industry-templates/resolve/company/${companyId}`);
    return res.data.data;
};
