import api from './api';

export const getGroups = async (params) => {
    const response = await api.get('/groups', { params });
    return response.data;
};

export const getGroup = async (id) => {
    const response = await api.get(`/groups/${id}`);
    return response.data;
};

export const createGroup = async (data) => {
    const response = await api.post('/groups', data);
    return response.data;
};

export const updateGroup = async (id, data) => {
    const response = await api.patch(`/groups/${id}`, data);
    return response.data;
};

export const deleteGroup = async (id) => {
    const response = await api.delete(`/groups/${id}`);
    return response.data;
};

export const addMember = async (groupId, data) => {
    const response = await api.post(`/groups/${groupId}/members`, data);
    return response.data;
};

export const removeMember = async (groupId, userId) => {
    const response = await api.delete(`/groups/${groupId}/members/${userId}`);
    return response.data;
};

export const getAssignableGroups = async () => {
    const response = await api.get('/groups/assignable');
    return response.data; // Backend returns { success: true, data: [...] }
};
