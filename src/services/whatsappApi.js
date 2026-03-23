import api from './api';

export const getWhatsAppSettings = async () => {
    const response = await api.get('/whatsapp-settings');
    return response.data;
};

export const updateWhatsAppSettings = async (data) => {
    const response = await api.post('/whatsapp-settings', data);
    return response.data;
};

export const checkWhatsAppSession = async () => {
    const response = await api.get('/whatsapp-settings/session-status');
    return response.data;
};

export const connectWhatsApp = async () => {
    const response = await api.post('/whatsapp-settings/connect', {}, { timeout: 120000 });
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

