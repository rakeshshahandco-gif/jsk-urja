import api from './api';

export const getItemTypes = async (params = {}) => {
    const res = await api.get('/item-types', { params });
    return res.data.data || [];
};

export const createItemType = async (data) => {
    const res = await api.post('/item-types', data);
    return res.data.data;
};

export const updateItemType = async (id, data) => {
    const res = await api.patch(`/item-types/${id}`, data);
    return res.data.data;
};

export const deleteItemType = async (id) => {
    const res = await api.delete(`/item-types/${id}`);
    return res.data;
};
