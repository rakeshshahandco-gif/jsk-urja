import Distributor from '../models/distributor.model.js';
import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';

/**
 * Create a distributor
 * @param {Object} distributorBody
 * @returns {Promise<Distributor>}
 */
const createDistributor = async (distributorBody) => {
    return Distributor.create(distributorBody);
};

/**
 * Query for distributors
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryDistributors = async (filter, options = {}) => {
    const { limit = 50, page = 1, sortBy = 'name' } = options;
    const skip = (page - 1) * limit;
    
    const distributors = await Distributor.find({ ...filter, isDeleted: false })
        .sort(sortBy)
        .skip(skip)
        .limit(limit);
        
    const totalResults = await Distributor.countDocuments({ ...filter, isDeleted: false });
    const totalPages = Math.ceil(totalResults / limit);
    
    return {
        results: distributors,
        page,
        limit,
        totalPages,
        totalResults,
    };
};

/**
 * Get distributor by id
 * @param {ObjectId} id
 * @returns {Promise<Distributor>}
 */
const getDistributorById = async (id) => {
    return Distributor.findOne({ _id: id, isDeleted: false });
};

/**
 * Update distributor by id
 * @param {ObjectId} distributorId
 * @param {Object} updateBody
 * @returns {Promise<Distributor>}
 */
const updateDistributorById = async (distributorId, updateBody) => {
    const distributor = await getDistributorById(distributorId);
    if (!distributor) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Distributor not found');
    }
    Object.assign(distributor, updateBody);
    await distributor.save();
    return distributor;
};

/**
 * Delete distributor by id
 * @param {ObjectId} distributorId
 * @returns {Promise<Distributor>}
 */
const deleteDistributorById = async (distributorId) => {
    const distributor = await getDistributorById(distributorId);
    if (!distributor) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Distributor not found');
    }
    distributor.isDeleted = true;
    await distributor.save();
    return distributor;
};

export default {
    createDistributor,
    queryDistributors,
    getDistributorById,
    updateDistributorById,
    deleteDistributorById,
};
