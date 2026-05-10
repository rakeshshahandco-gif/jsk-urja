import api from './api';

// --- SHIFTS ---
export const getShifts = async () => {
    const response = await api.get('/hr/shifts');
    return response.data;
};

export const createShift = async (data) => {
    const response = await api.post('/hr/shifts', data);
    return response.data;
};

export const updateShift = async (id, data) => {
    const response = await api.patch(`/hr/shifts/${id}`, data);
    return response.data;
};

export const deleteShift = async (id) => {
    const response = await api.delete(`/hr/shifts/${id}`);
    return response.data;
};

// --- EMPLOYEES ---
export const getEmployees = async (params) => {
    const response = await api.get('/hr/employees', { params });
    return response.data;
};

export const generateEmployeeCode = async () => {
    const response = await api.get('/hr/employees/generate-code');
    return response.data;
};

export const getEmployee = async (id) => {
    const response = await api.get(`/hr/employees/${id}`);
    return response.data;
};

export const createEmployee = async (data) => {
    const response = await api.post('/hr/employees', data);
    return response.data;
};

export const updateEmployee = async (id, data) => {
    const response = await api.patch(`/hr/employees/${id}`, data);
    return response.data;
};

export const deleteEmployee = async (id) => {
    const response = await api.delete(`/hr/employees/${id}`);
    return response.data;
};

// --- HOLIDAYS ---
export const getHolidays = async (params) => {
    const response = await api.get('/hr/holidays', { params });
    return response.data;
};

export const createHoliday = async (data) => {
    const response = await api.post('/hr/holidays', data);
    return response.data;
};

export const updateHoliday = async (id, data) => {
    const response = await api.patch(`/hr/holidays/${id}`, data);
    return response.data;
};

export const deleteHoliday = async (id) => {
    const response = await api.delete(`/hr/holidays/${id}`);
    return response.data;
};
