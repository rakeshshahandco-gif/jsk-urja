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

export const addTaskUpdate = async (taskId, data) => {
  const response = await api.post(`/tasks/${taskId}/updates`, data);
  return response.data;
};

// ---------------------------
// TASK MASTERS (RECURRING TEMPLATES)
// ---------------------------
export const getTaskMasters = async (params = {}) => {
  const response = await api.get("/tasks/masters", { params });
  return response.data.data;
};

export const getTaskMaster = async (id) => {
  const response = await api.get(`/tasks/masters/${id}`);
  return response.data.data;
};

export const createTaskMaster = async (data) => {
  const response = await api.post("/tasks/masters", data);
  return response.data;
};

export const updateTaskMaster = async (id, data) => {
  const response = await api.patch(`/tasks/masters/${id}`, data);
  return response.data;
};

export const deleteTaskMaster = async (id) => {
  const response = await api.delete(`/tasks/masters/${id}`);
  return response.data;
};

// ---------------------------
// GROUPS
// ---------------------------
export const getTaskGroups = async (params = {}) => {
  const response = await api.get("/task-groups", { params });
  return response.data.data;
};

export const getTaskGroup = async (id) => {
  const response = await api.get(`/task-groups/${id}`);
  return response.data.data;
};

export const createTaskGroup = async (data) => {
  const response = await api.post("/task-groups", data);
  return response.data;
};

export const updateTaskGroup = async (id, data) => {
  const response = await api.patch(`/task-groups/${id}`, data);
  return response.data;
};

export const deleteTaskGroup = async (id) => {
  const response = await api.delete(`/task-groups/${id}`);
  return response.data;
};
