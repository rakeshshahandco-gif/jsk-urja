import api from './api';

export const getPreferences = async () => {
    const response = await api.get('/users/preferences');
    return response.data.data;
};

export const updatePreferences = async (data) => {
    const response = await api.put('/users/preferences', data);
    return response.data.data;
};
