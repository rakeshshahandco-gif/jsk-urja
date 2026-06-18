import api from './api';

export const getCompanyWorkflowAssignment = async (companyId) => {
    const res = await api.get(`/company-workflow-assignment/${companyId}`);
    return res.data.data;
};

export const assignCompanyWorkflow = async (companyId, payload) => {
    const res = await api.put(`/company-workflow-assignment/${companyId}`, payload);
    return res.data.data;
};

export const getCompanyWorkflowOptions = async (companyId, industryTemplateRef) => {
    const res = await api.get(`/company-workflow-assignment/${companyId}/options`, {
        params: industryTemplateRef ? { industryTemplateRef } : {},
    });
    return res.data.data || [];
};
