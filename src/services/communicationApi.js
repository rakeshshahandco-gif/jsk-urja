import apiClient from './api';

export const sendOrder = (data) => 
    apiClient.post('/communication/send', data).then(r => r.data);

export const getCommunicationLogs = (params) => 
    apiClient.get('/communication/logs', { params }).then(r => r.data);

export const downloadOrderPDF = (id, type) => 
    apiClient.get('/communication/download-pdf', { params: { id, type }, responseType: 'blob' });

export default { sendOrder, getCommunicationLogs, downloadOrderPDF };
