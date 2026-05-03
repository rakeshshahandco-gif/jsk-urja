import api from './api';

export const userHomeService = {
    getPreferences: async (moduleName = 'dashboard') => {
        const { data } = await api.get('user-home/preferences', { params: { moduleName } });
        return data;
    },
    updatePreferences: async (selectedCards, moduleName = 'dashboard') => {
        const { data } = await api.post('user-home/preferences', { selectedCards, moduleName });
        return data;
    },
    resetPreferences: async (moduleName = 'dashboard') => {
        const { data } = await api.delete('user-home/preferences', { params: { moduleName } });
        return data;
    }
};
