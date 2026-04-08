import api from './api';

// ── Unified Search ───────────────────────────────────────────────────────────
export const searchWeChatUnified = (query) => api.get('/wechat/search', { params: query });

// ── Contacts ─────────────────────────────────────────────────────────────────
export const getWeChatContacts = (query) => api.get('/wechat/contacts', { params: query });
export const getWeChatContact = (id) => api.get(`/wechat/contacts/${id}`);
export const createWeChatContact = (data) => api.post('/wechat/contacts', data);
export const updateWeChatContact = (id, data) => api.patch(`/wechat/contacts/${id}`, data);
export const deleteWeChatContact = (id) => api.delete(`/wechat/contacts/${id}`);
export const addWeChatContactNote = (id, data) => api.post(`/wechat/contacts/${id}/notes`, data);

// ── Groups ───────────────────────────────────────────────────────────────────
export const getWeChatGroups = (query) => api.get('/wechat/groups', { params: query });
export const getWeChatGroup = (id) => api.get(`/wechat/groups/${id}`);
export const createWeChatGroup = (data) => api.post('/wechat/groups', data);
export const updateWeChatGroup = (id, data) => api.patch(`/wechat/groups/${id}`, data);
export const deleteWeChatGroup = (id) => api.delete(`/wechat/groups/${id}`);
export const addWeChatGroupNote = (id, data) => api.post(`/wechat/groups/${id}/notes`, data);

// ── Attachments ──────────────────────────────────────────────────────────────
export const uploadWeChatAttachment = (targetType, targetId, formData) => 
    api.post(`/wechat/attachments/${targetType}/${targetId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
