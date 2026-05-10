import api from './api';

export const getWhatsAppSettings = async () => {
    const response = await api.get('/whatsapp-settings');
    return response.data;
};

export const updateWhatsAppSettings = async (data) => {
    const response = await api.post('/whatsapp-settings', data);
    return response.data;
};

export const getWhatsAppStatus = async () => {
    const response = await api.get('/whatsapp-settings/status');
    return response.data;
};

// Kept for backward compatibility
export const checkWhatsAppSession = async () => {
    const response = await api.get('/whatsapp-settings/status');
    return response.data;
};

// Non-blocking — returns immediately; QR arrives via Socket.io
export const connectWhatsApp = async () => {
    const response = await api.post('/whatsapp-settings/connect', {}, { timeout: 10000 });
    return response.data;
};

export const disconnectWhatsApp = async () => {
    const response = await api.post('/whatsapp-settings/disconnect');
    return response.data;
};

export const getWhatsAppGroups = async () => {
    const response = await api.get('/whatsapp-settings/groups');
    return response.data;
};

export const sendWhatsAppMessage = async (data) => {
    const response = await api.post('/whatsapp-settings/send-message', data);
    return response.data;
};

export const sendWhatsAppDocument = async (data) => {
    const response = await api.post('/whatsapp-settings/send-document', data);
    return response.data;
};
