import api from './api';

export const getEffectiveSupplierFieldSettings = async (companyId) => {
    const res = await api.get('/supplier-template-field-settings/effective', {
        params: { companyId },
    });
    return res.data.data;
};

export const previewSupplierFieldSettings = async ({ companyId, templateId }) => {
    const res = await api.get('/supplier-template-field-settings/preview', {
        params: { companyId, templateId },
    });
    return res.data.data;
};

export const getSupplierFieldRegistry = async () => {
    const res = await api.get('/supplier-template-field-settings/registry');
    return res.data.data || [];
};

export const updateTemplateSupplierFieldSettings = async (templateId, supplierMaster) => {
    const res = await api.patch(`/supplier-template-field-settings/templates/${templateId}/supplier-fields`, {
        supplierMaster,
    });
    return res.data.data;
};

export const getCompanySupplierFieldOverride = async (companyId) => {
    const res = await api.get(`/supplier-template-field-settings/company-overrides/${companyId}`);
    return res.data.data;
};

export const upsertCompanySupplierFieldOverride = async (companyId, supplierMaster) => {
    const res = await api.put(`/supplier-template-field-settings/company-overrides/${companyId}`, {
        supplierMaster,
    });
    return res.data.data;
};
