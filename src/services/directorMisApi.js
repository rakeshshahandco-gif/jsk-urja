import api from './api';

const unwrap = (r) => r.data?.data ?? r.data;

export const directorMisApi = {
    getDashboard: (params = {}) =>
        api.get('/director-mis/dashboard', { params, timeout: 120000 }).then(unwrap),
    getAccessLogs: (params = {}) =>
        api.get('/director-mis/access-logs', { params }).then(unwrap),
};

export default directorMisApi;
