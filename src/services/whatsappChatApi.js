import api from './api';

/**
 * WhatsApp Chat API
 * Backed by /api/v1/whatsapp-chat/* — distinct from the older /whatsapp-chats
 * route so we don't collide with any legacy code or data still in MongoDB.
 */

export const listChats = async () => {
    const response = await api.get('/whatsapp-chat/chats');
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
