import api from './api';

// --- Company Profile API ---

export const getCompanyProfile = async () => {
    const response = await api.get('/company-profile');
    return response.data;
};

export const updateCompanyProfile = async (profileData) => {
    const isFormData = profileData instanceof FormData;
    const response = await api.put('/company-profile', profileData, {
        headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined
    });
    return response.data;
};
