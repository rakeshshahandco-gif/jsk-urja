import apiClient from '../config/apiClient';

export const getProjects = async (params) => {
    const response = await apiClient.get('/prd/projects', { params });
    return response.data.data;
};

export const getProject = async (id) => {
    const response = await apiClient.get(`/prd/projects/${id}`);
    return response.data.data;
};

export const createProject = async (formData) => {
    const response = await apiClient.post('/prd/projects', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data.data;
};

export const updateProject = async (id, formData) => {
    const response = await apiClient.put(`/prd/projects/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data.data;
};

export const deleteProject = async (id) => {
    const response = await apiClient.delete(`/prd/projects/${id}`);
    return response.data.data;
};


// --- Test Parameters API ---
export const getTestParameters = async (params) => {
    const response = await apiClient.get('/prd/test-parameters', { params });
    return response.data.data;
};

export const createTestParameter = async (payload) => {
    const response = await apiClient.post('/prd/test-parameters', payload);
    return response.data.data;
};

export const updateTestParameter = async (id, payload) => {
    const response = await apiClient.put(`/prd/test-parameters/${id}`, payload);
    return response.data.data;
};

export const deleteTestParameter = async (id) => {
    const response = await apiClient.delete(`/prd/test-parameters/${id}`);
    return response.data.data;
};


// --- Components Research API ---
export const getPrdComponents = async (params) => {
    const response = await apiClient.get('/prd/components', { params });
    return response.data.data;
};

export const createPrdComponent = async (payload) => {
    const response = await apiClient.post('/prd/components', payload);
    return response.data.data;
};

export const updatePrdComponent = async (id, payload) => {
    const response = await apiClient.put(`/prd/components/${id}`, payload);
    return response.data.data;
};

export const deletePrdComponent = async (id) => {
    const response = await apiClient.delete(`/prd/components/${id}`);
    return response.data.data;
};


// --- Design & Schematic API ---
export const getPrdDesigns = async (params) => {
    const response = await apiClient.get('/prd/designs', { params });
    return response.data.data;
};

export const createPrdDesign = async (formData) => {
    const response = await apiClient.post('/prd/designs', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data.data;
};

export const updatePrdDesign = async (id, formData) => {
    const response = await apiClient.put(`/prd/designs/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data.data;
};

export const deletePrdDesign = async (id) => {
    const response = await apiClient.delete(`/prd/designs/${id}`);
    return response.data.data;
};


// --- Prototype Build API ---
export const getPrdPrototypes = async (params) => {
    const response = await apiClient.get('/prd/prototypes', { params });
    return response.data.data;
};

export const createPrdPrototype = async (payload) => {
    const response = await apiClient.post('/prd/prototypes', payload);
    return response.data.data;
};

export const updatePrdPrototype = async (id, payload) => {
    const response = await apiClient.put(`/prd/prototypes/${id}`, payload);
    return response.data.data;
};

export const deletePrdPrototype = async (id) => {
    const response = await apiClient.delete(`/prd/prototypes/${id}`);
    return response.data.data;
};


// --- Test Reports API ---
export const getPrdTestReports = async (params) => {
    const response = await apiClient.get('/prd/test-reports', { params });
    return response.data.data;
};

export const getPrdTestReport = async (id) => {
    const response = await apiClient.get(`/prd/test-reports/${id}`);
    return response.data.data;
};

export const createPrdTestReport = async (formData) => {
    const response = await apiClient.post('/prd/test-reports', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data.data;
};

export const updatePrdTestReport = async (id, formData) => {
    const response = await apiClient.put(`/prd/test-reports/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data.data;
};

export const deletePrdTestReport = async (id) => {
    const response = await apiClient.delete(`/prd/test-reports/${id}`);
    return response.data.data;
};


// --- Issues API ---
export const getPrdIssues = async (params) => {
    const response = await apiClient.get('/prd/issues', { params });
    return response.data.data;
};

export const createPrdIssue = async (formData) => {
    const response = await apiClient.post('/prd/issues', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data.data;
};

export const updatePrdIssue = async (id, formData) => {
    const response = await apiClient.put(`/prd/issues/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data.data;
};

export const deletePrdIssue = async (id) => {
    const response = await apiClient.delete(`/prd/issues/${id}`);
    return response.data.data;
};


// --- Change Log (ECN) API ---
export const getPrdChangeLogs = async (params) => {
    const response = await apiClient.get('/prd/changelogs', { params });
    return response.data.data;
};

export const createPrdChangeLog = async (formData) => {
    const response = await apiClient.post('/prd/changelogs', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data.data;
};

export const updatePrdChangeLog = async (id, formData) => {
    const response = await apiClient.put(`/prd/changelogs/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data.data;
};

export const deletePrdChangeLog = async (id) => {
    const response = await apiClient.delete(`/prd/changelogs/${id}`);
    return response.data.data;
};


// --- Approval API ---
export const getPrdApprovals = async (params) => {
    const response = await apiClient.get('/prd/approvals', { params });
    return response.data.data;
};

export const createPrdApproval = async (payload) => {
    const response = await apiClient.post('/prd/approvals', payload);
    return response.data.data;
};

export const updatePrdApproval = async (id, payload) => {
    const response = await apiClient.put(`/prd/approvals/${id}`, payload);
    return response.data.data;
};


// --- Audit API ---
export const getPrdProjectAudits = async (projectId) => {
    const response = await apiClient.get(`/prd/audits/project/${projectId}`);
    return response.data.data;
};

export const getPrdSystemAudits = async () => {
    const response = await apiClient.get('/prd/audits/system');
    return response.data.data;
};
