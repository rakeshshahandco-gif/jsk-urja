import { apiClient } from '../lib/apiClient';
import { mergeFeatureSettings } from '../utils/featureSettings';

/** @deprecated Prefer useFeatureSettings().settings.customer — kept for API compatibility */
export const getSundryDebtorSettings = async () => {
    const response = await apiClient.get('/sundry-debtor/settings');
    return response.data.data;
};

export const saveSundryDebtorSettings = async (settings) => {
    const response = await apiClient.put('/sundry-debtor/settings', settings);
    return response.data.data;
};

export const DEFAULT_SUNDRY_DEBTOR_FIELD_FLAGS = mergeFeatureSettings(null).customer;

export const listCustomerTypeMaster = async () => {
    const response = await apiClient.get('/sundry-debtor/customer-types');
    return response.data.data;
};

export const createCustomerTypeMaster = async (name) => {
    const response = await apiClient.post('/sundry-debtor/customer-types', { name });
    return response.data.data;
};
