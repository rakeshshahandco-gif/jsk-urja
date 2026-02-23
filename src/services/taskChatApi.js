import { apiClient as api } from '@/lib/apiClient';

export const getChatRooms = async () => {
    const response = await api.get('/task-chats/rooms');
    return response.data;
};

export const getMessages = async (taskId) => {
    const response = await api.get(`/task-chats/${taskId}/messages`);
    return response.data;
};

export const sendMessage = async (taskId, content, type = 'text') => {
    const response = await api.post(`/task-chats/${taskId}/messages`, { content, type });
    return response.data;
};
