import apiClient from './api';

const unwrap = (res) => res.data?.data ?? res.data;

export const emailBulkApi = {
    getMeta: async () => unwrap(await apiClient.get('/email-bulk/meta')),
    getSettings: async () => unwrap(await apiClient.get('/email-bulk/settings')),
    saveSettings: async (body) => unwrap(await apiClient.put('/email-bulk/settings', body)),
    listTemplates: async () => unwrap(await apiClient.get('/email-bulk/templates'))?.results || [],
    createTemplate: async (body) => unwrap(await apiClient.post('/email-bulk/templates', body)),
    updateTemplate: async (id, body) => unwrap(await apiClient.put(`/email-bulk/templates/${id}`, body)),
    deleteTemplate: async (id) => unwrap(await apiClient.delete(`/email-bulk/templates/${id}`)),
    uploadTemplateAttachment: async (file) => {
        const form = new FormData();
        form.append('file', file);
        return unwrap(await apiClient.post('/email-bulk/templates/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } }));
    },
    listBlacklist: async () => unwrap(await apiClient.get('/email-bulk/blacklist'))?.results || [],
    addBlacklist: async (body) => unwrap(await apiClient.post('/email-bulk/blacklist', body)),
    removeBlacklist: async (id) => unwrap(await apiClient.delete(`/email-bulk/blacklist/${id}`)),
    listCampaigns: async (params = {}) => unwrap(await apiClient.get('/email-bulk/campaigns', { params }))?.results || [],
    getCampaign: async (id) => unwrap(await apiClient.get(`/email-bulk/campaigns/${id}`)),
    createCampaign: async (body) => unwrap(await apiClient.post('/email-bulk/campaigns', body)),
    updateCampaign: async (id, body) => unwrap(await apiClient.put(`/email-bulk/campaigns/${id}`, body)),
    deleteCampaign: async (id) => unwrap(await apiClient.delete(`/email-bulk/campaigns/${id}`)),
    previewRecipients: async (body) => unwrap(await apiClient.post('/email-bulk/campaigns/preview', body)),
    uploadRecipientFile: async (file) => {
        const form = new FormData();
        form.append('file', file);
        return unwrap(await apiClient.post('/email-bulk/campaigns/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } }));
    },
    uploadCampaignAttachment: async (file) => {
        const form = new FormData();
        form.append('file', file);
        return unwrap(await apiClient.post('/email-bulk/campaigns/attachment-upload', form, { headers: { 'Content-Type': 'multipart/form-data' } }));
    },
    saveRecipients: async (id) => unwrap(await apiClient.post(`/email-bulk/campaigns/${id}/recipients`)),
    listRecipients: async (id, params = {}) => unwrap(await apiClient.get(`/email-bulk/campaigns/${id}/recipients`, { params }))?.results || [],
    testSend: async (id, email) => unwrap(await apiClient.post(`/email-bulk/campaigns/${id}/test-send`, { email })),
    scheduleCampaign: async (id) => unwrap(await apiClient.post(`/email-bulk/campaigns/${id}/schedule`)),
    pauseCampaign: async (id) => unwrap(await apiClient.post(`/email-bulk/campaigns/${id}/pause`)),
    resumeCampaign: async (id) => unwrap(await apiClient.post(`/email-bulk/campaigns/${id}/resume`)),
    stopCampaign: async (id) => unwrap(await apiClient.post(`/email-bulk/campaigns/${id}/stop`)),
    retryFailed: async (id) => unwrap(await apiClient.post(`/email-bulk/campaigns/${id}/retry-failed`)),
    exportHistory: async () => {
        const res = await apiClient.get('/email-bulk/campaigns/export', { responseType: 'blob' });
        return res.data;
    },
};

export default emailBulkApi;
