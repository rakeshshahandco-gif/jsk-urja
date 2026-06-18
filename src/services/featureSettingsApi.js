import api from './api';

/** Unwrap backend ApiResponse { data: payload } from axios response body. */
function unwrapApi(res) {
    const body = res?.data;
    return body?.data !== undefined ? body.data : body;
}

export const getCompanyFeatureSettings = async () => {
    const res = await api.get('/company-feature-settings');
    return { data: unwrapApi(res) };
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
    return unwrapApi(res);
};

export const updatePlatformFeatureSettings = async (settings) => {
    const res = await api.patch('/platform-feature-settings', { settings });
    return unwrapApi(res);
};

export const applyPlatformDefaultsToAllCompanies = async () => {
    const res = await api.post('/platform-feature-settings/apply-to-all-companies');
    return unwrapApi(res);
};
