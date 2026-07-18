import api from './api';

export const getPrintFormatVersionRegistry = async () => {
    const res = await api.get('/print-format-versions/registry');
    return res.data.data || {};
};

export const getPrintFormatVersions = async (params = {}) => {
    const res = await api.get('/print-format-versions', { params });
    return res.data.data || [];
};

export const getPrintFormatVersion = async (id) => {
    const res = await api.get(`/print-format-versions/${id}`);
    return res.data.data;
};

export const createPrintFormatVersionDraft = async (payload) => {
    const res = await api.post('/print-format-versions', payload);
    return res.data.data;
};

export const copyPrintFormatVersion = async (id, payload = {}) => {
    const res = await api.post(`/print-format-versions/${id}/copy`, payload);
    return res.data.data;
};

export const updatePrintFormatVersion = async (id, payload) => {
    const res = await api.put(`/print-format-versions/${id}`, payload);
    return res.data.data;
};

export const approvePrintFormatVersion = async (id) => {
    const res = await api.patch(`/print-format-versions/${id}/approve`);
    return res.data.data;
};

export const setDefaultPrintFormatVersion = async (id) => {
    const res = await api.patch(`/print-format-versions/${id}/set-default`);
    return res.data.data;
};

export const lockPrintFormatVersion = async (id) => {
    const res = await api.patch(`/print-format-versions/${id}/lock`);
    return res.data.data;
};

export const archivePrintFormatVersion = async (id) => {
    const res = await api.patch(`/print-format-versions/${id}/archive`);
    return res.data.data;
};

export const previewPrintFormatVersion = async (id, params = {}) => {
    const res = await api.get(`/print-format-versions/${id}/preview`, { params });
    return res.data.data;
};
