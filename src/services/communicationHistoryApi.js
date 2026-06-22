import apiClient from './api';

const unwrap = (res) => res.data?.data ?? res.data;

export const communicationHistoryApi = {
    list: async (params = {}) => unwrap(await apiClient.get('/communication-history', { params }))?.results || [],
    get: async (id) => unwrap(await apiClient.get(/communication-history/)),
};

export default communicationHistoryApi;
