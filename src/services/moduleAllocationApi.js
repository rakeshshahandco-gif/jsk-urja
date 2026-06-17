import { apiClient } from '@/config/apiClient';

export const getModuleRegistry = async () => {
    const res = await apiClient.get('/module-allocation/registry');
    return res.data?.data || res.data;
};

export const getCompanyModuleAllocation = async (companyId) => {
    const res = await apiClient.get(`/module-allocation/company/${companyId}`);
    return res.data?.data || res.data;
};

export const updateCompanyModuleAllocation = async (companyId, payload) => {
    const res = await apiClient.put(`/module-allocation/company/${companyId}`, payload);
    return res.data?.data || res.data;
};

export const updateIndustryTemplateModules = async (templateId, moduleSettings) => {
    const res = await apiClient.put(`/module-allocation/industry-template/${templateId}/modules`, { moduleSettings });
    return res.data?.data || res.data;
};
