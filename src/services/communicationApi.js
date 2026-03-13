import apiClient from './api';

export const sendOrder = (data) => 
    apiClient.post('/communication/send', data).then(r => r.data);

export const getCommunicationLogs = (params) => 
    apiClient.get('/communication/logs', { params }).then(r => r.data);
