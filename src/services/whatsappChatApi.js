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
    const response = await api.get('/whatsapp-chat/chats', { timeout: 60000 });
    return response.data;
};

export const listMessages = async (jid, { limit = 50, before } = {}) => {
    const params = { limit };
    if (before) params.before = before;
    const response = await api.get(
        `/whatsapp-chat/chats/${encodeURIComponent(jid)}/messages`,
        // Message history can be slow on large chat logs; avoid global 10s timeout.
        { params, timeout: 45000 }
    );
    return response.data;
};

export const markRead = async (jid) => {
    const response = await api.post(
        `/whatsapp-chat/chats/${encodeURIComponent(jid)}/read`,
        {},
        { timeout: 30000 }
    );
    return response.data;
};

export const sendChatMessage = async (jid, text) => {
    const response = await api.post(
        `/whatsapp-chat/chats/${encodeURIComponent(jid)}/send`,
        { text },
        { timeout: 45000 }
    );
    return response.data;
};

export const syncChats = async () => {
    const response = await api.post('/whatsapp-chat/sync', {}, { timeout: 60000 });
    return response.data;
};

export const startChat = async (phone) => {
    const response = await api.post('/whatsapp-chat/chats/new', { phone });
    return response.data;
};

/**
 * Parse API error when responseType is blob (errors come back as JSON blobs).
 */
const parseMediaFetchError = async (err) => {
    const fallback = err.response?.data?.message || err.message || 'Could not download media';
    const data = err.response?.data;
    if (data instanceof Blob && data.type?.includes('json')) {
        try {
            const json = JSON.parse(await data.text());
            return json.message || fallback;
        } catch {
            return fallback;
        }
    }
    if (typeof data?.message === 'string') return data.message;
    return fallback;
};

/**
 * Fetches media bytes for preview or manual save (does not auto-download).
 */
export const fetchMessageMediaBlob = async (messageId) => {
    try {
        const response = await api.get(
            `/whatsapp-chat/messages/${encodeURIComponent(messageId)}/media`,
            { responseType: 'blob', timeout: 90000 }
        );
        const blob = response.data;
        if (blob?.type?.includes('json')) {
            try {
                const json = JSON.parse(await blob.text());
                throw new Error(json.message || 'Could not download media');
            } catch (e) {
                if (e.message && !e.message.includes('JSON')) throw e;
            }
        }
        return blob;
    } catch (err) {
        throw new Error(await parseMediaFetchError(err));
    }
};

const saveBlobAsFile = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
};

/**
 * Downloads the media bytes for a single message and triggers a browser
 * save-as. `messageId` is the Mongo _id of the WhatsApp message row.
 */
export const downloadMessageMedia = async (messageId, suggestedFilename) => {
    const blob = await fetchMessageMediaBlob(messageId);
    saveBlobAsFile(blob, suggestedFilename || `whatsapp-${messageId}`);
};

export { saveBlobAsFile };
