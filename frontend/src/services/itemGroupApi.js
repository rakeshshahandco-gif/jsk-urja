import api from './api';

export const getItemGroups = async (params) => {
    const response = await api.get('/item-groups', { params });
    return response.data.data;
};

export const createItemGroup = async (data) => {
    const response = await api.post('/item-groups', data);
    return response.data.data;
};

export const updateItemGroup = async (id, data) => {
    const response = await api.patch(`/item-groups/${id}`, data);
    return response.data.data;
};

export const deleteItemGroup = async (id) => {
    const response = await api.delete(`/item-groups/${id}`);
    return response.data;
};
