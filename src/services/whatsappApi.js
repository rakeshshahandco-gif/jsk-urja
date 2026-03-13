import api from './api';

export const getWhatsAppSettings = async () => {
    const response = await api.get('/whatsapp-settings');
    return response.data;
};

export const updateWhatsAppSettings = async (data) => {
    const response = await api.post('/whatsapp-settings', data);
    return response.data;
};
