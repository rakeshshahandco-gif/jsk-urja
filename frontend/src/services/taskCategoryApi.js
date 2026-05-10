import API from './api';

export const getTaskCategories = async (params = {}) => {
    const response = await API.get('/task-categories', { params });
    return response.data;
};

export const getTaskCategory = async (id) => {
    const response = await API.get(`/task-categories/${id}`);
    return response.data;
};

export const createTaskCategory = async (categoryData) => {
    const response = await API.post('/task-categories', categoryData);
    return response.data;
};

export const updateTaskCategory = async (id, categoryData) => {
    const response = await API.patch(`/task-categories/${id}`, categoryData);
    return response.data;
};

export const deleteTaskCategory = async (id) => {
    const response = await API.delete(`/task-categories/${id}`);
    return response.data;
};
