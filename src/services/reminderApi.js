import api from '../config/api';

export const createReminder = async (data) => {
    return api.post('/reminders', data);
};

export const getReminders = async (params = {}) => {
    return api.get('/reminders', params);
};

export const getReminder = async (id) => {
    return api.get(`/reminders/${id}`);
};

export const closeReminder = async (id) => {
    return api.put(`/reminders/${id}/close`);
};

export const extendReminder = async (id, data) => {
    return api.put(`/reminders/${id}/extend`, data);
};

export const upsertReminder = async (customerId, data) => {
    return api.put(`/customers/${customerId}/reminder`, data);
};

export const rescheduleReminder = async (id, data) => {
    return api.put(`/reminders/${id}/reschedule`, data);
};
