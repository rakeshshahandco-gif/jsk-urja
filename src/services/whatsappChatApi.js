import api from './api';

/**
 * WhatsApp Chat API
 * Backed by /api/v1/whatsapp-chat/* — distinct from the older /whatsapp-chats
 * route so we don't collide with any legacy code or data still in MongoDB.
 */

export const listChats = async () => {
    // Per-call timeout override: the chat list aggregates across all of the
    // user's WhatsApp messages and runs a CRM customer-match. On accounts
    // with hundreds of chats this can take longer than the global 10s axios
    // default — so allow 30s for this one endpoint to avoid spurious
    // "timeout of 10000ms exceeded" toasts in the chat UI.
    const response = await api.get('/whatsapp-chat/chats', { timeout: 30000 });
    return response.data;
};

export const listMessages = async (jid, { limit = 50, before } = {}) => {
    const params = { limit };
    if (before) params.before = before;
    const response = await api.get(
        `/whatsapp-chat/chats/${encodeURIComponent(jid)}/messages`,
        { params }
    );
    return response.data;
};

export const markRead = async (jid) => {
    const response = await api.post(
        `/whatsapp-chat/chats/${encodeURIComponent(jid)}/read`
    );
    return response.data;
};

export const sendChatMessage = async (jid, text) => {
    const response = await api.post(
        `/whatsapp-chat/chats/${encodeURIComponent(jid)}/send`,
        { text }
    );
    return response.data;
};

export const syncChats = async () => {
    const response = await api.post('/whatsapp-chat/sync');
    return response.data;
};

export const startChat = async (phone) => {
    const response = await api.post('/whatsapp-chat/chats/new', { phone });
    return response.data;
};

/**
 * Downloads the media bytes for a single message and triggers a browser
 * save-as. `messageId` is the Mongo _id of the WhatsApp message row.
 * `suggestedFilename` is used as the saved filename (server also returns one
 * via Content-Disposition; we just take the explicit JS value to be safe).
 */
export const downloadMessageMedia = async (messageId, suggestedFilename) => {
    const response = await api.get(
        `/whatsapp-chat/messages/${encodeURIComponent(messageId)}/media`,
        { responseType: 'blob', timeout: 60000 }
    );
    const blob = response.data;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedFilename || `whatsapp-${messageId}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
};
