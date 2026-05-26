import api from './api';

export const getCompanyFeatureSettings = async () => {
    const res = await api.get('/company-feature-settings');
    return res.data;
};

export const updateCompanyFeatureSettings = async (settings) => {
    const res = await api.patch('/company-feature-settings', { settings });
    return res.data;
};

export const getFeatureSettingsDefaults = async () => {
    const res = await api.get('/company-feature-settings/defaults');
    return res.data;
};

export const getPlatformFeatureSettings = async () => {
    const res = await api.get('/platform-feature-settings');
    return res.data;
};

export const updatePlatformFeatureSettings = async (settings) => {
    const res = await api.patch('/platform-feature-settings', { settings });
    return res.data;
};

export const applyPlatformDefaultsToAllCompanies = async () => {
    const res = await api.post('/platform-feature-settings/apply-to-all-companies');
    return res.data;
};
