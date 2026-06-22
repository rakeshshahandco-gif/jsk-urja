import apiClient from './api';

const unwrap = (res) => res.data?.data ?? res.data;

export const emailSettingsApi = {
    getProviders: async () => unwrap(await apiClient.get('/email-settings/providers')),
    getSettings: async () => unwrap(await apiClient.get('/email-settings')),
    saveSettings: async (body) => unwrap(await apiClient.put('/email-settings', body)),
    testConnection: async (body) => unwrap(await apiClient.post('/email-settings/test', body)),
};

export default emailSettingsApi;
