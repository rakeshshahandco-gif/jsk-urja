import api from './api';

export const getFailures = async () => {
    const response = await api.get('/production-rework-failures');
    return response.data;
};

export const getFailureById = async (id) => {
    const response = await api.get(`/production-rework-failures/${id}`);
    return response.data;
};

export const createFailure = async (data) => {
    const response = await api.post('/production-rework-failures', data);
    return response.data;
};

// Job Cards
export const getJobCards = async (params) => {
    const response = await api.get('/production-rework-job-cards', { params });
    return response.data;
};

export const getJobCardById = async (id) => {
    const response = await api.get(`/production-rework-job-cards/${id}`);
    return response.data;
};

export const createJobCard = async (data) => {
    const response = await api.post('/production-rework-job-cards', data);
    return response.data;
};

// Material Issues
export const getMaterialIssues = async (params) => {
    const response = await api.get('/production-rework-material-issues', { params });
    return response.data;
};

export const createMaterialIssue = async (data) => {
    const response = await api.post('/production-rework-material-issues', data);
    return response.data;
};

// Outputs
export const getOutputs = async (params) => {
    const response = await api.get('/production-rework-outputs', { params });
    return response.data;
};

export const createOutput = async (data) => {
    const response = await api.post('/production-rework-outputs', data);
    return response.data;
};

// Retests
export const getRetests = async (params) => {
    const response = await api.get('/production-rework-retests', { params });
    return response.data;
};

export const createRetest = async (data) => {
    const response = await api.post('/production-rework-retests', data);
    return response.data;
};

// Scraps
export const getScraps = async (params) => {
    const response = await api.get('/production-rework-scraps', { params });
    return response.data;
};

export const createScrap = async (data) => {
    const response = await api.post('/production-rework-scraps', data);
    return response.data;
};
