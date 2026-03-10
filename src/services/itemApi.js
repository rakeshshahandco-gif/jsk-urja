import api from './api';

// ── Items CRUD ──────────────────────────────────────────────────────────────
export const getItems = async (params = {}) => {
    const res = await api.get('/items', { params });
    return res.data;
};

export const getItem = async (id) => {
    const res = await api.get(`/items/${id}`);
    return res.data.data;
};

export const createItem = async (data) => {
    const res = await api.post('/items', data);
    return res.data.data;
};

export const updateItem = async (id, data) => {
    const res = await api.patch(`/items/${id}`, data);
    return res.data.data;
};

export const deleteItem = async (id) => {
    const res = await api.delete(`/items/${id}`);
    return res.data;
};

export const generateItemCode = async (itemType = 'OTHER') => {
    const res = await api.get('/items/generate-code', { params: { itemType } });
    return res.data.data?.itemCode;
};

export const exportItemsExcel = async (params = {}) => {
    const res = await api.get('/items/export/excel', { params, responseType: 'blob' });
    return res.data;
};

export const exportItemsPDF = async (params = {}) => {
    const res = await api.get('/items/export/pdf', { params, responseType: 'blob' });
    return res.data;
};

export const exportItemTemplate = async () => {
    const res = await api.get('/items/export/template', { responseType: 'blob' });
    return res.data;
};

export const importItemsExcel = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/items/import/excel', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });
    return res.data;
};
