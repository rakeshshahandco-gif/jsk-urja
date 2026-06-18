import api from '@/config/apiClient';

export const importCenterApi = {
    getHistory: (params) => api.get('/import-center/history', { params }).then((r) => r.data?.data),
    downloadErrors: (id) =>
        api.get(`/import-center/history/${id}/errors`, { responseType: 'blob' }).then((r) => r.data),
    getLearning: (params) => api.get('/import-center/learning', { params }).then((r) => r.data?.data),
    saveLearning: (body) => api.post('/import-center/learning', body).then((r) => r.data?.data),
};
