import apiClient from '../config/apiClient';

// ── Threads ──────────────────────────────────────────────────
export const createThread = async (payload) => {
    const { data } = await apiClient.post('/messenger/threads', payload);
    return data.data;
};

export const getMyThreads = async () => {
    const { data } = await apiClient.get('/messenger/threads');
    return data.data;
};

export const getThread = async (threadId) => {
    const { data } = await apiClient.get(`/messenger/threads/${threadId}`);
    return data.data;
};

// ── Messages ─────────────────────────────────────────────────
export const getMessages = async (threadId, page = 1, limit = 50) => {
    const { data } = await apiClient.get(`/messenger/threads/${threadId}/messages`, {
        params: { page, limit },
    });
    return data.data;
};

export const sendMessage = async (threadId, payload) => {
    const { data } = await apiClient.post(`/messenger/threads/${threadId}/messages`, payload);
    return data.data;
};

export const markThreadRead = async (threadId) => {
    const { data } = await apiClient.patch(`/messenger/threads/${threadId}/read`);
    return data.data;
};

export const deleteMessage = async (messageId) => {
    const { data } = await apiClient.delete(`/messenger/messages/${messageId}`);
    return data.data;
};

// ── Search & Stats ───────────────────────────────────────────
export const searchMessages = async (params) => {
    const { data } = await apiClient.get('/messenger/search', { params });
    return data.data;
};

export const getUnreadSummary = async () => {
    const { data } = await apiClient.get('/messenger/unread');
    return data.data;
};
