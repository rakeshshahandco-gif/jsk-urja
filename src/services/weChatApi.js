import api from './api';
export { api };

// ── Contacts ─────────────────────────────────────────────────────────────────
export const getWeChatContacts = (query) => api.get('/wechat/contacts', { params: query });
export const getWeChatContact = (id) => api.get(`/wechat/contacts/${id}`);
export const createWeChatContact = (data) => api.post('/wechat/contacts', data);
export const updateWeChatContact = (id, data) => api.put(`/wechat/contacts/${id}`, data);
export const deleteWeChatContact = (id) => api.delete(`/wechat/contacts/${id}`);

// ── Groups ───────────────────────────────────────────────────────────────────
export const getWeChatGroups = (query) => api.get('/wechat/groups', { params: query });
export const getWeChatGroup = (id) => api.get(`/wechat/groups/${id}`);
export const createWeChatGroup = (data) => api.post('/wechat/groups', data);
export const updateWeChatGroup = (id, data) => api.put(`/wechat/groups/${id}`, data);
export const deleteWeChatGroup = (id) => api.delete(`/wechat/groups/${id}`);

// ── Group Members ────────────────────────────────────────────────────────────
export const addWeChatGroupMember = (groupId, data) => api.post(`/wechat/groups/${groupId}/members`, data);
export const updateWeChatGroupMember = (membershipId, data) => api.put(`/wechat/groups/members/${membershipId}`, data);
export const removeWeChatGroupMember = (membershipId) => api.delete(`/wechat/groups/members/${membershipId}`);

// ── Products (R&D Product Master) ────────────────────────────────────────────
export const getWeChatProducts = (query) => api.get('/wechat/products', { params: query });
export const getWeChatProduct = (id) => api.get(`/wechat/products/${id}`);
export const createWeChatProduct = (data) => api.post('/wechat/products', data);
export const updateWeChatProduct = (id, data) => api.put(`/wechat/products/${id}`, data);
export const deleteWeChatProduct = (id) => api.delete(`/wechat/products/${id}`);

// ── Price Records (Supplier Matrix) ──────────────────────────────────────────
export const getWeChatPrices = (query) => api.get('/wechat/prices', { params: query });
export const getWeChatProductPrices = (productId) => api.get(`/wechat/products/${productId}/prices`);
export const addWeChatPriceRecord = (data) => api.post('/wechat/prices', data);
export const createWeChatPriceRecord = (data) => api.post('/wechat/prices', data);
export const updateWeChatPriceRecord = (id, data) => api.put(`/wechat/prices/${id}`, data);
export const deleteWeChatPriceRecord = (id) => api.delete(`/wechat/prices/${id}`);

// ── Search & Utils ────────────────────────────────────────────────────────────
export const getWeChatDashboardStats = () => api.get('/wechat/dashboard');
export const globalWeChatSearch = (q) => api.get('/wechat/search', { params: { q } });
export const exportWeChatContacts = () => api.get('/wechat/export/contacts', { responseType: 'blob' });
export const exportWeChatPrices = (productId) => api.get('/wechat/export/prices', { params: { productId }, responseType: 'blob' });
export const exportWeChatComparison = (query) => api.get('/wechat/export/prices', { params: query, responseType: 'blob' });
export const compareWeChatProducts = (query) => api.get('/wechat/prices', { params: query });
export const importWeChatContacts = (formData) => api.post('/wechat/import/contacts', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

// ── Samples ──────────────────────────────────────────────────────────────────
export const getWeChatSamples = (query) => api.get('/wechat/samples', { params: query });
export const getWeChatSample = (id) => api.get(`/wechat/samples/${id}`);
export const createWeChatSample = (data) => api.post('/wechat/samples', data);
export const updateWeChatSample = (id, data) => api.put(`/wechat/samples/${id}`, data);
export const deleteWeChatSample = (id) => api.delete(`/wechat/samples/${id}`);

// ── Follow Ups / Notes ───────────────────────────────────────────────────────
export const getWeChatFollowUps = (query) => api.get('/wechat/followups', { params: query });
export const createWeChatFollowUp = (data) => api.post('/wechat/followups', data);
export const updateWeChatFollowUp = (id, data) => api.put(`/wechat/followups/${id}`, data);
export const deleteWeChatFollowUp = (id) => api.delete(`/wechat/followups/${id}`);
