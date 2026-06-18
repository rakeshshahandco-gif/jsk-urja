import { apiClient } from '../lib/apiClient';

function unwrap(res) {
    const body = res?.data;
    return body?.data !== undefined ? body.data : body;
}

export const getFeatureRegistry = async () => {
    const res = await apiClient.get('/feature-configuration/registry');
    return unwrap(res)?.registry || [];
};

export const getFeatureConfiguration = async () => {
    const res = await apiClient.get('/feature-configuration');
    return unwrap(res);
};

export const saveFeatureConfiguration = async (payload) => {
    const res = await apiClient.put('/feature-configuration', payload);
    return unwrap(res);
};
