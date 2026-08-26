import api from './api';

export const listCustomerPriceLists = (params) =>
    api.get('/customer-price-lists', { params }).then((r) => r.data);

export const getCustomerPriceList = (id) =>
    api.get(`/customer-price-lists/${id}`).then((r) => r.data.data);

export const createCustomerPriceList = (data) =>
    api.post('/customer-price-lists', data).then((r) => r.data.data);

export const updateCustomerPriceList = (id, data) =>
    api.put(`/customer-price-lists/${id}`, data).then((r) => r.data.data);

export const approveCustomerPriceList = (id) =>
    api.post(`/customer-price-lists/${id}/approve`).then((r) => r.data.data);

export const expireCustomerPriceList = (id) =>
    api.post(`/customer-price-lists/${id}/expire`).then((r) => r.data.data);

export const reviseCustomerPriceList = (id, data = {}) =>
    api.post(`/customer-price-lists/${id}/revise`, data).then((r) => r.data.data);

export const markCustomerPriceListSent = (id, data) =>
    api.post(`/customer-price-lists/${id}/mark-sent`, data).then((r) => r.data.data);

export const suggestCustomerPrice = (params) =>
    api.get('/customer-price-lists/suggest', { params }).then((r) => r.data.data);

export const getCustomerPriceHistory = (params) =>
    api.get('/customer-price-lists/history', { params }).then((r) => r.data.data);

export const getCustomerPriceListPrintPayload = (id) =>
    api.get(`/customer-price-lists/${id}/print-payload`).then((r) => r.data.data);

export const downloadCustomerPriceListExcel = async (id) => {
    const res = await api.get(`/customer-price-lists/${id}/excel`, { responseType: 'blob' });
    return res.data;
};

export const findPossibleCustomersForPriceList = (params) =>
    api.get('/customer-price-lists/possible-customers', { params }).then((r) => r.data.data);

export const linkCustomerPriceList = (id, customerId) =>
    api.post(`/customer-price-lists/${id}/link-customer`, { customerId }).then((r) => r.data.data);

export const getProductPriceDefault = (params) =>
    api.get('/customer-price-lists/product-defaults', { params }).then((r) => r.data.data);

export const saveProductPriceDefault = (data) =>
    api.put('/customer-price-lists/product-defaults', data).then((r) => r.data.data);

export const getLastPriceForItem = (params) =>
    api.get('/customer-price-lists/last-for-item', { params }).then((r) => r.data.data);
