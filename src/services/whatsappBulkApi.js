import apiClient from './api';

const unwrap = (res) => res.data?.data ?? res.data;

export const whatsappBulkApi = {
    getMeta: async () => unwrap(await apiClient.get('/whatsapp-bulk/meta')),
    getSettings: async () => unwrap(await apiClient.get('/whatsapp-bulk/settings')),
    saveSettings: async (body) => unwrap(await apiClient.put('/whatsapp-bulk/settings', body)),
    listMatters: async () => unwrap(await apiClient.get('/whatsapp-bulk/matters'))?.results || [],
    createMatter: async (body) => unwrap(await apiClient.post('/whatsapp-bulk/matters', body)),
    updateMatter: async (id, body) => unwrap(await apiClient.put(`/whatsapp-bulk/matters/${id}`, body)),
    deleteMatter: async (id) => unwrap(await apiClient.delete(`/whatsapp-bulk/matters/${id}`)),
    uploadMatterAttachment: async (file) => {
        const form = new FormData();
        form.append('file', file);
        return unwrap(await apiClient.post('/whatsapp-bulk/matters/upload', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }));
    },
    listBlacklist: async () => unwrap(await apiClient.get('/whatsapp-bulk/blacklist'))?.results || [],
    addBlacklist: async (body) => unwrap(await apiClient.post('/whatsapp-bulk/blacklist', body)),
    removeBlacklist: async (id) => unwrap(await apiClient.delete(`/whatsapp-bulk/blacklist/${id}`)),
    listCampaigns: async (params = {}) => unwrap(await apiClient.get('/whatsapp-bulk/campaigns', { params }))?.results || [],
    getCampaign: async (id) => unwrap(await apiClient.get(`/whatsapp-bulk/campaigns/${id}`)),
    createCampaign: async (body) => unwrap(await apiClient.post('/whatsapp-bulk/campaigns', body)),
    updateCampaign: async (id, body) => unwrap(await apiClient.put(`/whatsapp-bulk/campaigns/${id}`, body)),
    deleteCampaign: async (id) => unwrap(await apiClient.delete(`/whatsapp-bulk/campaigns/${id}`)),
    previewRecipients: async (body) => unwrap(await apiClient.post('/whatsapp-bulk/campaigns/preview', body)),
    uploadCampaignImage: async (file) => {
        const form = new FormData();
        form.append('file', file);
        return unwrap(await apiClient.post('/whatsapp-bulk/campaigns/image-upload', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }));
    },
    uploadRecipientFile: async (file) => {
        const form = new FormData();
        form.append('file', file);
        return unwrap(await apiClient.post('/whatsapp-bulk/campaigns/upload', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }));
    },
    parseNumbersFromFile: async (file, sourceHint = 'txt_upload') => {
        const form = new FormData();
        form.append('file', file);
        form.append('sourceHint', sourceHint);
        return unwrap(await apiClient.post('/whatsapp-bulk/campaigns/parse-numbers', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }));
    },
    saveRecipients: async (id, body) => unwrap(await apiClient.post(`/whatsapp-bulk/campaigns/${id}/recipients`, body || {})),
    listRecipients: async (id, params = {}) => unwrap(await apiClient.get(`/whatsapp-bulk/campaigns/${id}/recipients`, { params }))?.results || [],
    testSend: async (id, mobile) => unwrap(await apiClient.post(`/whatsapp-bulk/campaigns/${id}/test-send`, { mobile })),
    scheduleCampaign: async (id) => unwrap(await apiClient.post(`/whatsapp-bulk/campaigns/${id}/schedule`)),
    approveCampaign: async (id) => unwrap(await apiClient.post(`/whatsapp-bulk/campaigns/${id}/approve`)),
    aiAssist: async (body) => unwrap(await apiClient.post('/whatsapp-bulk/ai-assist', body)),
    pauseCampaign: async (id) => unwrap(await apiClient.post(`/whatsapp-bulk/campaigns/${id}/pause`)),
    resumeCampaign: async (id) => unwrap(await apiClient.post(`/whatsapp-bulk/campaigns/${id}/resume`)),
    stopCampaign: async (id) => unwrap(await apiClient.post(`/whatsapp-bulk/campaigns/${id}/stop`)),
    retryFailed: async (id) => unwrap(await apiClient.post(`/whatsapp-bulk/campaigns/${id}/retry-failed`)),
    revokeSent: async (id) => unwrap(await apiClient.post(`/whatsapp-bulk/campaigns/${id}/revoke-sent`)),
    exportHistory: async () => {
        const res = await apiClient.get('/whatsapp-bulk/campaigns/export', { responseType: 'blob' });
        return res.data;
    },
    numberHealthSummary: async () => unwrap(await apiClient.get('/whatsapp-bulk/number-health/summary')),
    numberHealthList: async (params = {}) => unwrap(await apiClient.get('/whatsapp-bulk/number-health', { params })),
    numberHealthValidate: async (items) => unwrap(await apiClient.post('/whatsapp-bulk/number-health/validate', { items })),
    numberHealthDuplicates: async (items) => unwrap(await apiClient.post('/whatsapp-bulk/number-health/duplicates', { items })),
    numberHealthAvailabilityCheck: async (body) => unwrap(await apiClient.post('/whatsapp-bulk/number-health/availability-check', body || {})),
    numberHealthRecheckUnknown: async (body) => unwrap(await apiClient.post('/whatsapp-bulk/number-health/recheck-unknown', body || {})),
    numberHealthExport: async (params = {}) => {
        const res = await apiClient.get('/whatsapp-bulk/number-health/export', { params, responseType: 'blob' });
        return res.data;
    },
    numberHealthRisk: async (normalizedNumber) => unwrap(await apiClient.get(`/whatsapp-bulk/number-health/risk/${encodeURIComponent(normalizedNumber)}`)),
    campaignPrecheck: async (id) => unwrap(await apiClient.get(`/whatsapp-bulk/campaigns/${id}/precheck`)),
    campaignPerformanceReport: async (id) => unwrap(await apiClient.get(`/whatsapp-bulk/campaigns/${id}/performance-report`)),
};

export default whatsappBulkApi;
