import api from './api';

export const getRdProjects = (query) => api.get('/rd-samples/projects', { params: query });
export const getRdProject = (id) => api.get(`/rd-samples/projects/${id}`);
export const createRdProject = (data) => api.post('/rd-samples/projects', data);
export const updateRdProject = (id, data) => api.patch(`/rd-samples/projects/${id}`, data);
export const deleteRdProject = (id) => api.delete(`/rd-samples/projects/${id}`);

export const getRdSamples = (query) => api.get('/rd-samples/samples', { params: query });
export const getRdSample = (id) => api.get(`/rd-samples/samples/${id}`);
export const createRdSample = (data) => api.post('/rd-samples/samples', data);
export const updateRdSample = (id, data) => api.patch(`/rd-samples/samples/${id}`, data);
export const deleteRdSample = (id) => api.delete(`/rd-samples/samples/${id}`);

export const addRdTestHistory = (id, data) => api.post(`/rd-samples/samples/${id}/test`, data);
export const getRdComparisonReport = (projectId) => api.get('/rd-samples/reports/comparison', { params: { projectId } });
