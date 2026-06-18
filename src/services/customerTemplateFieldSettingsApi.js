import api from './api';

export const getEffectiveCustomerFieldSettings = async (companyId) => {
    const res = await api.get('/customer-template-field-settings/effective', {
        params: { companyId },
    });
    return res.data.data;
};

export const previewCustomerFieldSettings = async ({ companyId, templateId }) => {
    const res = await api.get('/customer-template-field-settings/preview', {
        params: { companyId, templateId },
    });
    return res.data.data;
};

export const getCustomerFieldRegistry = async () => {
    const res = await api.get('/customer-template-field-settings/registry');
    return res.data.data || [];
};

export const updateTemplateCustomerFieldSettings = async (templateId, customerMaster) => {
    const res = await api.patch(`/customer-template-field-settings/templates/${templateId}/customer-fields`, {
        customerMaster,
    });
    return res.data.data;
};

export const getCompanyCustomerFieldOverride = async (companyId) => {
    const res = await api.get(`/customer-template-field-settings/company-overrides/${companyId}`);
    return res.data.data;
};

export const upsertCompanyCustomerFieldOverride = async (companyId, customerMaster) => {
    const res = await api.put(`/customer-template-field-settings/company-overrides/${companyId}`, {
        customerMaster,
    });
    return res.data.data;
};
