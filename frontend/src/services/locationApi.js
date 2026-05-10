import apiClient from '../config/apiClient';

/**
 * Fetches coordinates and address components (like pincode) from Google Geocoding API via backend proxy
 * @param {string} address - The full address string
 * @returns {Promise<Object>} - The geocode response { postalCode, city, state, country, formattedAddress }
 */
export const fetchGeocodeAddress = async (address) => {
    if (!address || typeof address !== 'string' || !address.trim()) {
        throw new Error('Address is required');
    }
    const response = await apiClient.get('/utils/geocode', {
        params: { address: address.trim() }
    });
    return response.data.data;
};
