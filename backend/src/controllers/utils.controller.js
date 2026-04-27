import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const geocodeAddress = asyncHandler(async (req, res) => {
    const { address } = req.query;
    
    if (!address) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Address query parameter is required');
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Google Maps API key is not configured on the server');
    }

    try {
        const fetchUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
        const response = await fetch(fetchUrl);
        const data = await response.json();

        if (data.status !== 'OK') {
            if (data.status === 'ZERO_RESULTS') {
                return res.send(new ApiResponse(httpStatus.OK, null, 'No results found for this address'));
            }
            throw new ApiError(httpStatus.BAD_REQUEST, `Google API Error: ${data.status}`);
        }

        const result = data.results[0];
        
        let postalCode = '';
        let city = '';
        let district = '';
        let taluka = '';
        let state = '';
        let country = '';

        result.address_components.forEach(component => {
            if (component.types.includes('postal_code')) {
                postalCode = component.long_name;
            }
            if (component.types.includes('locality')) {
                city = component.long_name;
            }
            if (component.types.includes('administrative_area_level_2')) {
                district = component.long_name;
            }
            if (component.types.includes('administrative_area_level_3') || component.types.includes('sublocality_level_1')) {
                // In India, taluka/tehsil is often administrative_area_level_3 or sublocality
                if (!taluka) taluka = component.long_name;
            }
            if (component.types.includes('administrative_area_level_1')) {
                state = component.long_name;
            }
            if (component.types.includes('country')) {
                country = component.long_name;
            }
        });

        res.send(new ApiResponse(httpStatus.OK, {
            postalCode,
            city,
            district,
            taluka,
            state,
            country,
            formattedAddress: result.formatted_address
        }, 'Address fetched successfully'));

    } catch (error) {
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch location data from Google');
    }
});

/**
 * Fetch live exchange rates from public API (Backend Proxy to avoid CORS)
 */
export const getLiveExchangeRates = asyncHandler(async (req, res) => {
    const fetchWithTimeout = async (url, timeout = 5000) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (e) {
            clearTimeout(id);
            throw e;
        }
    };

    try {
        const [cnyRes, usdRes] = await Promise.all([
            fetchWithTimeout('https://api.frankfurter.app/latest?from=CNY&to=INR'),
            fetchWithTimeout('https://api.frankfurter.app/latest?from=USD&to=INR')
        ]);
        
        const cnyData = await cnyRes.json();
        const usdData = await usdRes.json();
        
        const rates = {
            CNY: cnyData.rates.INR,
            USD: usdData.rates.INR
        };
        
        res.send(new ApiResponse(httpStatus.OK, rates, 'Live exchange rates fetched successfully'));
    } catch (error) {
        console.error('Exchange rate fetch error:', error);
        // Better fallbacks based on recent trends
        const fallbackRates = { CNY: 11.55, USD: 83.45 };
        res.send(new ApiResponse(httpStatus.OK, fallbackRates, 'Live rates unavailable, using fallbacks'));
    }
});
