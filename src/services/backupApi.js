import apiClient from './api';

export const getBackups = () => 
    apiClient.get('/backups').then(r => r.data);

export const triggerBackup = (reason) => 
    apiClient.post('/backups/trigger', { reason }).then(r => r.data);

export const downloadBackup = (id) => {
    // For download, we usually want to use a direct link or blob
    // But since it's admin-only, we need to pass the token.
    // The easiest way is to use a fetch with token and then create a blob.
    return apiClient.get(`/backups/download/${id}`, { responseType: 'blob' })
        .then(response => {
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${id}.zip`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        });
};

export const restoreBackup = (id) => 
    apiClient.post(`/backups/restore/${id}`).then(r => r.data);
