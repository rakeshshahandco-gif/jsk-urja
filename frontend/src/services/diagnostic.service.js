import api from './api';

export const diagnosticService = {
    getDiscovery: async () => {
        const { data } = await api.get('admin/diagnostics/discovery');
        return data;
    },
    getHealth: async () => {
        const { data } = await api.get('admin/diagnostics/health');
        return data;
    }
};
