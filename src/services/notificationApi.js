import api from './api';

export const getNotifications = async () => {
    const response = await api.get('/notifications');
    return response.data.data || response.data || response;
};

export const markNotificationAsRead = async (notificationId) => {
    const response = await api.patch(`/notifications/${notificationId}/read`);
    return response.data.data || response.data || response;
};

export const markAllNotificationsAsRead = async () => {
    const response = await api.patch('/notifications/mark-all-read');
    return response.data.data || response.data || response;
};
