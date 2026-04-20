import api from './api';

// ── Unified Search & Export ──────────────────────────────────────────────────
export const searchWeChatUnified = (query) => api.get('/wechat/search', { params: query });
export const exportWeChatContacts = (query) => api.get('/wechat/export/contacts', { params: query, responseType: 'blob' });
export const exportWeChatComparison = (query) => api.get('/wechat/export/comparison', { params: query, responseType: 'blob' });

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

// ── Products (Supplier Part / Product Mapping) ────────────────────────────────
export const getWeChatProducts = (params) => api.get('/wechat/products', { params });
export const getWeChatProduct = (id) => api.get(`/wechat/products/${id}`);
export const createWeChatProduct = (data) => api.post('/wechat/products', data);
export const updateWeChatProduct = (id, data) => api.patch(`/wechat/products/${id}`, data);
export const deleteWeChatProduct = (id) => api.delete(`/wechat/products/${id}`);
export const uploadWeChatProductAttachment = (productId, formData) =>
    api.post(`/wechat/products/${productId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });

// KEY: Cross-supplier comparison for same part number
export const compareWeChatProducts = (params) => api.get('/wechat/products/compare', { params });

// ── Price Records (Immutable Price History) ───────────────────────────────────
export const getWeChatPrices = (params) => api.get('/wechat/prices', { params });
export const addWeChatPriceRecord = (data) => api.post('/wechat/prices', data);
export const deleteWeChatPriceRecord = (id) => api.delete(`/wechat/prices/${id}`);
export const getWeChatPriceTrend = (params) => api.get('/wechat/prices/trend', { params });

// ── Chat / Communication History ─────────────────────────────────────────────
export const getWeChatChats = (params) => api.get('/wechat/chats', { params });
export const addWeChatChat = (data) => api.post('/wechat/chats', data);
export const deleteWeChatChat = (id) => api.delete(`/wechat/chats/${id}`);
export const uploadWeChatChatAttachment = (chatId, formData) =>
    api.post(`/wechat/chats/${chatId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
