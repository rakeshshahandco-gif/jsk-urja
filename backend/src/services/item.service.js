import { Item } from '../models/item.model.js';
import { ApiError } from '../utils/ApiError.js';
import httpStatus from 'http-status';

/**
 * Find items by item codes
 * @param {Array} codes - Array of item codes
 * @returns {Promise<Array>}
 */
const findByItemCodes = async (codes) => {
    return Item.find({ itemCode: { $in: codes } });
};

/**
 * Bulk create items
 * @param {Array} items - Array of item objects
 * @returns {Promise<Array>}
 */
const bulkCreateItems = async (items) => {
    return Item.insertMany(items, { ordered: false });
};

export default {
    findByItemCodes,
    bulkCreateItems,
};
