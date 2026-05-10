import api from './api';

export const userService = {
    getAllUsers: async () => {
        const { data } = await api.get('/users');
        return data; // Expected { success: true, data: [...] }
    },

    createUser: async (userData) => {
        const { data } = await api.post('/users', userData);
        return data;
    },

    updateUser: async (id, userData) => {
        const { data } = await api.patch(`/users/${id}`, userData);
        return data;
    },

    deleteUser: async (id) => {
        const { data } = await api.delete(`/users/${id}`);
        return data;
    },

    getAssignableUsers: async () => {
        const { data } = await api.get('/users');
        return data.data; // TaskForm expects Array [...users]
    },

    getPermissionMetadata: async () => {
        const { data } = await api.get('/users/permissions/metadata');
        return data;
    },

    syncPermissions: async () => {
        const { data } = await api.post('/users/permissions/sync');
        return data;
    },

    getRoles: async () => {
        const { data } = await api.get('/users/roles');
        return data;
    },

    getDepartments: async () => {
        const { data } = await api.get('/users/departments');
        return data;
    }
};
