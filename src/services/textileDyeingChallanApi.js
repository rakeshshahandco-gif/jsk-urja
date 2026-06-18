import api from './api';

const BASE = '/textile-dyeing-challans';

export const getTextileDyeingChallanMeta = async () => {
    const res = await api.get(`${BASE}/meta`);
    return res.data.data;
};

export const getTextileDyeingChallanEligibility = async (companyId) => {
    const res = await api.get(`${BASE}/eligibility`, { params: companyId ? { companyId } : {} });
    return res.data.data;
};

export const listTextileDyeingChallans = async (params = {}) => {
    const res = await api.get(BASE, { params });
    return res.data.data || [];
};

export const getTextileDyeingChallan = async (id) => {
    const res = await api.get(`${BASE}/${id}`);
    return res.data.data;
};

export const lookupTextileDyeingChallan = async (barcode) => {
    const res = await api.get(`${BASE}/lookup`, { params: { barcode } });
    return res.data.data;
};

export const createTextileDyeingChallan = async (payload) => {
    const res = await api.post(BASE, payload);
    return res.data.data;
};

export const recordTextileDyeingReturn = async (challanId, payload) => {
    const res = await api.post(`${BASE}/${challanId}/returns`, payload);
    return res.data.data;
};

export const getTextileDyeingChallanBarcode = async (id) => {
    const res = await api.get(`${BASE}/${id}/barcode`);
    return res.data.data;
};

export const getStockWithDyersReport = async (params = {}) => {
    const res = await api.get(`${BASE}/reports/stock-with-dyers`, { params });
    return res.data.data || [];
};

export const getPendingDyeingChallansReport = async (params = {}) => {
    const res = await api.get(`${BASE}/reports/pending`, { params });
    return res.data.data || [];
};

export const getDyeingReturnRegisterReport = async (params = {}) => {
    const res = await api.get(`${BASE}/reports/return-register`, { params });
    return res.data.data || [];
};

export const getDyerLedgerReport = async (params = {}) => {
    const res = await api.get(`${BASE}/reports/dyer-ledger`, { params });
    return res.data.data || [];
};

export const getDyeingLossReport = async (params = {}) => {
    const res = await api.get(`${BASE}/reports/loss`, { params });
    return res.data.data || [];
};
