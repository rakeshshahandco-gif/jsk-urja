import api from './api';

export const userHomeService = {
    getPreferences: async () => {
        const { data } = await api.get('user-home/preferences');
        return data;
    },
    updatePreferences: async (selectedCards) => {
        const { data } = await api.post('user-home/preferences', { selectedCards });
        return data;
    },
    resetPreferences: async () => {
        const { data } = await api.delete('user-home/preferences');
        return data;
    }
};
