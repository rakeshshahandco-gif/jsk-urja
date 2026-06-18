import api from './api';

const BASE = '/textile-conversions';

export const getTextileConversionMeta = async () => {
    const res = await api.get(`${BASE}/meta`);
    return res.data.data;
};

export const getTextileConversionEligibility = async (companyId) => {
    const res = await api.get(`${BASE}/eligibility`, { params: { companyId } });
    return res.data.data;
};

export const listConversionMasters = async (params = {}) => {
    const res = await api.get(`${BASE}/masters`, { params });
    return res.data.data;
};

export const getConversionMaster = async (id, companyId) => {
    const res = await api.get(`${BASE}/masters/${id}`, { params: { companyId } });
    return res.data.data;
};

export const createConversionMaster = async (data) => {
    const res = await api.post(`${BASE}/masters`, data);
    return res.data.data;
};

export const updateConversionMaster = async (id, data) => {
    const res = await api.patch(`${BASE}/masters/${id}`, data);
    return res.data.data;
};

export const deleteConversionMaster = async (id, companyId) => {
    const res = await api.delete(`${BASE}/masters/${id}`, { params: { companyId } });
    return res.data;
};

export const previewTransformation = async (data) => {
    const res = await api.post(`${BASE}/preview`, data);
    return res.data.data;
};

export const listTransformations = async (params = {}) => {
    const res = await api.get(`${BASE}/entries`, { params });
    return res.data.data;
};

export const getTransformation = async (id, companyId) => {
    const res = await api.get(`${BASE}/entries/${id}`, { params: { companyId } });
    return res.data.data;
};

export const createTransformation = async (data) => {
    const res = await api.post(`${BASE}/entries`, data);
    return res.data.data;
};

export const cancelTransformation = async (id, companyId) => {
    const res = await api.post(`${BASE}/entries/${id}/cancel`, null, { params: { companyId } });
    return res.data.data;
};

export const getTransformationChainReport = async (companyId) => {
    const res = await api.get(`${BASE}/reports/chain`, { params: { companyId } });
    return res.data.data;
};
