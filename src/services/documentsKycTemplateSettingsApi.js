import api from './api';

export const getEffectiveDocumentsKycSettings = async (companyId) => {
    const res = await api.get('/documents-kyc-template-settings/effective', {
        params: { companyId },
    });
    return res.data.data;
};

export const previewDocumentsKycSettings = async ({ companyId, templateId }) => {
    const res = await api.get('/documents-kyc-template-settings/preview', {
        params: { companyId, templateId },
    });
    return res.data.data;
};

export const getDocumentsKycRegistry = async () => {
    const res = await api.get('/documents-kyc-template-settings/registry');
    return res.data.data || {};
};

export const updateTemplateDocumentsKycSettings = async (templateId, payload) => {
    const res = await api.patch(`/documents-kyc-template-settings/templates/${templateId}/document-rules`, payload);
    return res.data.data;
};

export const getCompanyDocumentsKycOverride = async (companyId) => {
    const res = await api.get(`/documents-kyc-template-settings/company-overrides/${companyId}`);
    return res.data.data;
};

export const upsertCompanyDocumentsKycOverride = async (companyId, payload) => {
    const res = await api.put(`/documents-kyc-template-settings/company-overrides/${companyId}`, payload);
    return res.data.data;
};
