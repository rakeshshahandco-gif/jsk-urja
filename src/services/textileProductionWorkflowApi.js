import api from './api';

const ROUTES_BASE = '/textile-process-routes';
const ORDERS_BASE = '/textile-production-orders';

export const getTextileProcessRouteMeta = async () => {
    const res = await api.get(`${ROUTES_BASE}/meta`);
    return res.data.data;
};

export const listTextileProcessRoutes = async (params = {}) => {
    const res = await api.get(ROUTES_BASE, { params });
    return res.data.data || [];
};

export const getTextileProcessRoute = async (id) => {
    const res = await api.get(`${ROUTES_BASE}/${id}`);
    return res.data.data;
};

export const createTextileProcessRoute = async (payload) => {
    const res = await api.post(ROUTES_BASE, payload);
    return res.data.data;
};

export const updateTextileProcessRoute = async (id, payload) => {
    const res = await api.patch(`${ROUTES_BASE}/${id}`, payload);
    return res.data.data;
};

export const getTextileProductionOrderMeta = async () => {
    const res = await api.get(`${ORDERS_BASE}/meta`);
    return res.data.data;
};

export const listTextileProductionOrders = async (params = {}) => {
    const res = await api.get(ORDERS_BASE, { params });
    return res.data.data || [];
};

export const getTextileProductionDashboard = async (params = {}) => {
    const res = await api.get(`${ORDERS_BASE}/dashboard`, { params });
    return res.data.data || [];
};

export const getTextileProductionOrder = async (id) => {
    const res = await api.get(`${ORDERS_BASE}/${id}`);
    return res.data.data;
};

export const createTextileProductionOrder = async (payload) => {
    const res = await api.post(ORDERS_BASE, payload);
    return res.data.data;
};

export const startTextileProductionOrder = async (id) => {
    const res = await api.post(`${ORDERS_BASE}/${id}/start`);
    return res.data.data;
};

export const skipTextileProductionStage = async (id, payload) => {
    const res = await api.post(`${ORDERS_BASE}/${id}/skip-stage`, payload);
    return res.data.data;
};

export const completeTextileProductionStage = async (id, payload) => {
    const res = await api.post(`${ORDERS_BASE}/${id}/complete-stage`, payload);
    return res.data.data;
};

export const issueTextileProductionStage = async (id, payload) => {
    const res = await api.post(`${ORDERS_BASE}/${id}/issue-stage`, payload);
    return res.data.data;
};

export const receiveTextileProductionStage = async (id, payload) => {
    const res = await api.post(`${ORDERS_BASE}/${id}/receive-stage`, payload);
    return res.data.data;
};
