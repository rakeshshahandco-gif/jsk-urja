import api from './api';

export const getEffectiveItemFieldSettings = async (companyId) => {
    const res = await api.get('/item-template-field-settings/effective', {
        params: { companyId },
    });
    return res.data.data;
};

export const previewItemFieldSettings = async ({ companyId, templateId }) => {
    const res = await api.get('/item-template-field-settings/preview', {
        params: { companyId, templateId },
    });
    return res.data.data;
};

export const getItemFieldRegistry = async () => {
    const res = await api.get('/item-template-field-settings/registry');
    return res.data.data || [];
};

export const updateTemplateItemFieldSettings = async (templateId, itemMaster) => {
    const res = await api.patch(`/item-template-field-settings/templates/${templateId}/item-fields`, {
        itemMaster,
    });
    return res.data.data;
};

export const getCompanyItemFieldOverride = async (companyId) => {
    const res = await api.get(`/item-template-field-settings/company-overrides/${companyId}`);
    return res.data.data;
};

export const upsertCompanyItemFieldOverride = async (companyId, itemMaster) => {
    const res = await api.put(`/item-template-field-settings/company-overrides/${companyId}`, {
        itemMaster,
    });
    return res.data.data;
};
