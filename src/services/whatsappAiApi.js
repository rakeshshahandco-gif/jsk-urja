import apiClient from './api';

const unwrap = (res) => res.data?.data ?? res.data;

/**
 * WhatsApp AI API client — foundation endpoints only.
 * Foundation endpoints only. Live WhatsApp and lead promotion are out of scope.
 */
export const whatsappAiApi = {
    health: async () => unwrap(await apiClient.get('/whatsapp-ai/health')),
    getSettings: async () => unwrap(await apiClient.get('/whatsapp-ai/settings')),
    updateSettings: async (body) => unwrap(await apiClient.put('/whatsapp-ai/settings', body)),
    listConversations: async (params = {}) => unwrap(await apiClient.get('/whatsapp-ai/conversations', { params })),
    getConversation: async (id) => unwrap(await apiClient.get(`/whatsapp-ai/conversations/${id}`)),
    listLeadDrafts: async (params = {}) => unwrap(await apiClient.get('/whatsapp-ai/lead-drafts', { params })),
    getLeadDraft: async (id) => unwrap(await apiClient.get(`/whatsapp-ai/lead-drafts/${id}`)),
    listKnowledge: async (params = {}) => unwrap(await apiClient.get('/whatsapp-ai/knowledge', { params })),
    createKnowledge: async (body) => unwrap(await apiClient.post('/whatsapp-ai/knowledge', body)),
    updateKnowledge: async (id, body) => unwrap(await apiClient.put(`/whatsapp-ai/knowledge/${id}`, body)),
    submitKnowledge: async (id) => unwrap(await apiClient.post(`/whatsapp-ai/knowledge/${id}/submit`)),
    approveKnowledge: async (id) => unwrap(await apiClient.post(`/whatsapp-ai/knowledge/${id}/approve`)),
    rejectKnowledge: async (id, body = {}) => unwrap(await apiClient.post(`/whatsapp-ai/knowledge/${id}/reject`, body)),
    activateKnowledge: async (id) => unwrap(await apiClient.post(`/whatsapp-ai/knowledge/${id}/activate`)),
    deactivateKnowledge: async (id) => unwrap(await apiClient.post(`/whatsapp-ai/knowledge/${id}/deactivate`)),
    listDocuments: async (params = {}) => unwrap(await apiClient.get('/whatsapp-ai/documents', { params })),
    createDocument: async (body) => unwrap(await apiClient.post('/whatsapp-ai/documents', body)),
    updateDocument: async (id, body) => unwrap(await apiClient.put(`/whatsapp-ai/documents/${id}`, body)),
    listAuditLogs: async (params = {}) => unwrap(await apiClient.get('/whatsapp-ai/audit-logs', { params })),
    permissionsCheck: async () => unwrap(await apiClient.get('/whatsapp-ai/permissions-check')),
    dashboardSummary: async () => unwrap(await apiClient.get('/whatsapp-ai/dashboard-summary')),
    testInbound: async (body) => unwrap(await apiClient.post('/whatsapp-ai/internal/test-inbound', body)),
    testGenerateDraft: async (body) => unwrap(await apiClient.post('/whatsapp-ai/internal/test-generate-draft', body)),
    getTestDraft: async (id) => unwrap(await apiClient.get(`/whatsapp-ai/internal/test-drafts/${id}`)),
};

export default whatsappAiApi;
