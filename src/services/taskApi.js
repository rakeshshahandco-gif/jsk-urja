import api from "./api";

export const getTasks = async (params = {}) => {
  const response = await api.get("/tasks", { params });
  return response.data.data;
};

export const getTask = async (id) => {
  const response = await api.get(`/tasks/${id}`);
  return response.data.data;
};

export const createTask = async (data) => {
  const response = await api.post("/tasks", data);
  return response.data.data;
};

export const updateTask = async (id, data) => {
  const response = await api.patch(`/tasks/${id}`, data);
  return response.data.data;
};

export const updateTaskStatus = async (id, status) => {
  const response = await api.patch(`/tasks/${id}/status`, { status });
  return response.data.data;
};

export const extendTask = async (id, extensionData) => {
  const response = await api.post(`/tasks/${id}/extend`, extensionData);
  return response.data.data;
};

export const closeTask = async (id) => {
  const response = await api.post(`/tasks/${id}/close`);
  return response.data.data;
};

export const deleteTask = async (id) => {
  await api.delete(`/tasks/${id}`);
};
