import apiClient from './client';

// All calls go to the SAME backend/database as the desktop CRM
// Any update from mobile instantly reflects on desktop and vice versa

export const tasksApi = {
  // Get all tasks with optional filters
  getTasks: async (params = {}) => {
    const response = await apiClient.get('/tasks', { params });
    return response.data;
  },

  // Get single task detail
  getTask: async (taskId) => {
    const response = await apiClient.get(`/tasks/${taskId}`);
    return response.data;
  },

  // Create new task
  createTask: async (taskData) => {
    const response = await apiClient.post('/tasks', taskData);
    return response.data;
  },

  // Create new recurring task master
  createTaskMaster: async (masterData) => {
    const response = await apiClient.post('/tasks/masters', masterData);
    return response.data;
  },

  // Update task fields
  updateTask: async (taskId, updateData) => {
    const response = await apiClient.patch(`/tasks/${taskId}`, updateData);
    return response.data;
  },

  // Add a text update/note to a task
  addUpdate: async (taskId, text) => {
    const response = await apiClient.post(`/tasks/${taskId}/updates`, { text });
    return response.data;
  },

  // Extend task (change next due date)
  extendTask: async (taskId, newDueDate, reason) => {
    const response = await apiClient.post(`/tasks/${taskId}/extend`, {
      nextDueDate: newDueDate,
      reason,
    });
    return response.data;
  },

  // Close / Conclude task
  closeTask: async (taskId, closingNote) => {
    const response = await apiClient.post(`/tasks/${taskId}/close`, {
      closingNote,
    });
    return response.data;
  },

  // Update task status
  updateStatus: async (taskId, status) => {
    const response = await apiClient.patch(`/tasks/${taskId}/status`, { status });
    return response.data;
  },
};

export const taskGroupsApi = {
  // Get all groups accessible to current user
  getMyGroups: async () => {
    const response = await apiClient.get('/task-groups/my');
    return response.data;
  },
  // Create a new group
  createGroup: async (groupData) => {
    const response = await apiClient.post('/task-groups', groupData);
    return response.data;
  },
};

export const taskCategoriesApi = {
  // Get all task categories
  getCategories: async () => {
    const response = await apiClient.get('/task-categories');
    return response.data;
  },
};

export const teamsApi = {
  // Get all teams / assignable groups
  getTeams: async () => {
    const response = await apiClient.get('/groups'); // Desktop uses /groups for 'teams'
    return response.data;
  },
};

export const usersApi = {
  // Get all users (for assign-to dropdown)
  getUsers: async () => {
    const response = await apiClient.get('/users');
    return response.data;
  },
};
