import Conversation from '../models/conversation.model.js';
import Customer from '../models/customer.model.js';
import { ApiError } from '../utils/ApiError.js';
import logger from '../utils/logger.js';

/**
 * Create a conversation
 * @param {Object} body
 * @returns {Promise<Conversation>}
 */
const createConversation = async (body) => {
    logger.info('📝 Creating conversation for customer:', body.customerId);
    const conversation = await Conversation.create(body);

    // Update Customer lead stage and notConvertedDetails if status is provided
    if (body.followUpStatus) {
        await Customer.findByIdAndUpdate(body.customerId, {
            leadStage: body.followUpStatus,
            notConvertedDetails: body.notConvertedDetails || {}
        });
        logger.info(`🔄 Updated Customer ${body.customerId} lead stage to: ${body.followUpStatus}`);
    }

    logger.info(`✅ Conversation created with ID: ${conversation._id}`);
    return conversation;
};

/**
 * Query for conversations
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<Object>}
 */
const queryConversations = async (filter, options) => {
    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 10;
    const skip = (page - 1) * limit;

    // Handle date range filter
    if (options.startDate || options.endDate) {
        filter.conversationDate = {};
        if (options.startDate) {
            filter.conversationDate.$gte = new Date(options.startDate);
        }
        if (options.endDate) {
            filter.conversationDate.$lte = new Date(options.endDate);
        }
    }

    // Sorting
    let sort = '';
    if (options.sortBy) {
        const sortingCriteria = [];
        options.sortBy.split(',').forEach((sortOption) => {
            const [key, order] = sortOption.split(':');
            sortingCriteria.push((order === 'desc' ? '-' : '') + key);
        });
        sort = sortingCriteria.join(' ');
    } else {
        sort = '-conversationDate'; // Default sort by most recent
    }

    const conversations = await Conversation.find(filter)
        .populate('customerId', 'name company contactPersons')
        .sort(sort)
        .skip(skip)
        .limit(limit);

    const totalResults = await Conversation.countDocuments(filter);
    const totalPages = Math.ceil(totalResults / limit);

    return {
        results: conversations,
        page,
        limit,
        totalPages,
        totalResults
    };
};

/**
 * Get conversation by id
 * @param {ObjectId} id
 * @returns {Promise<Conversation>}
 */
const getConversationById = async (id) => {
    return Conversation.findById(id).populate('customerId', 'name company contactPersons');
};

/**
 * Get conversations by customer ID
 * @param {ObjectId} customerId
 * @param {Object} options - Query options
 * @returns {Promise<Object>}
 */
const getConversationsByCustomer = async (customerId, options = {}) => {
    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 10;
    const skip = (page - 1) * limit;

    const conversations = await Conversation.find({ customerId })
        .populate('customerId', 'name company contactPersons')
        .sort('-conversationDate')
        .skip(skip)
        .limit(limit);

    const totalResults = await Conversation.countDocuments({ customerId });
    const totalPages = Math.ceil(totalResults / limit);

    return {
        results: conversations,
        page,
        limit,
        totalPages,
        totalResults
    };
};

/**
 * Update conversation by id
 * @param {ObjectId} conversationId
 * @param {Object} updateBody
 * @returns {Promise<Conversation>}
 */
const updateConversationById = async (conversationId, updateBody) => {
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
        throw new ApiError(404, 'Conversation not found');
    }

    Object.assign(conversation, updateBody);
    await conversation.save();
    return conversation;
};

/**
 * Delete conversation by id
 * @param {ObjectId} conversationId
 * @returns {Promise<Conversation>}
 */
const deleteConversationById = async (conversationId) => {
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
        throw new ApiError(404, 'Conversation not found');
    }
    await conversation.deleteOne();
    return conversation;
};

export default {
    createConversation,
    queryConversations,
    getConversationById,
    getConversationsByCustomer,
    updateConversationById,
    deleteConversationById,
};
