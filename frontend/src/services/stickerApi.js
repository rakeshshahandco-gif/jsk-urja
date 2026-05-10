import { apiClient } from '../lib/apiClient';

/**
 * Sticker API Service
 */

export const getStickers = async (params = {}) => {
    try {
        const response = await apiClient.get('/stickers', { params });
        return response.data.data;
    } catch (error) {
        console.error('Error fetching stickers:', error);
        throw new Error(error.response?.data?.message || error.message);
    }
};

export const getSticker = async (id) => {
    try {
        const response = await apiClient.get(`/stickers/${id}`);
        return response.data.data;
    } catch (error) {
        console.error('Error fetching sticker:', error);
        throw error;
    }
};

export const createSticker = async (stickerData) => {
    try {
        const response = await apiClient.post('/stickers', stickerData);
        return response.data.data;
    } catch (error) {
        console.error('Error creating sticker:', error);
        throw error;
    }
};

export const updateSticker = async (id, stickerData) => {
    try {
        const response = await apiClient.put(`/stickers/${id}`, stickerData);
        return response.data.data;
    } catch (error) {
        console.error('Error updating sticker:', error);
        throw new Error(error.response?.data?.message || error.message);
    }
};

export const deleteSticker = async (id) => {
    try {
        const response = await apiClient.delete(`/stickers/${id}`);
        return response.data.data;
    } catch (error) {
        console.error('Error deleting sticker:', error);
        throw error;
    }
};

export default {
    getStickers,
    getSticker,
    createSticker,
    updateSticker,
    deleteSticker,
};
