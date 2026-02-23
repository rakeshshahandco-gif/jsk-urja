import Followup from '../models/followup.model.js';
import Reminder from '../models/reminder.model.js';
import { ApiError } from '../utils/ApiError.js';
import logger from '../utils/logger.js';

/**
 * Sync reminder based on follow-up state
 * @param {Object} followup 
 * @param {Object} body (optional, for conversationId)
 */
const syncReminder = async (followup, body = {}) => {
    if (followup.reminderEnabled) {
        // Upsert open reminder
        await Reminder.findOneAndUpdate(
            {
                customerId: followup.customerId,
                isClosed: false
            },
            {
                customerId: followup.customerId,
                followUpId: followup._id,
                conversationId: body.conversationId || followup.conversationId,
                reminderDate: followup.nextCallDate,
                reminderTime: followup.nextCallTime,
                followUpType: followup.followUpType,
                taskNote: followup.whatToTalkNext,
                priority: followup.priority,
                isClosed: false,
                createdBy: followup.createdBy
            },
            { upsert: true, new: true }
        );
        logger.info(`⏰ Reminder synced for customer: ${followup.customerId}`);
    } else {
        // Close any open reminders
        await Reminder.updateMany(
            { customerId: followup.customerId, isClosed: false },
            { isClosed: true, closedAt: new Date() }
        );
        logger.info(`🔕 Reminder disabled/closed for customer: ${followup.customerId}`);
    }
};

/**
 * Create a follow-up
 * @param {Object} body
 * @returns {Promise<Followup>}
 */
const createFollowup = async (body) => {
    logger.info('📝 Creating follow-up for customer:', body.customerId);
    // Check if follow-up already exists for this customer
    const existingFollowup = await Followup.findOne({ customerId: body.customerId });
    if (existingFollowup) {
        throw new ApiError(400, 'Follow-up already exists for this customer. Please update the existing one.');
    }
    const followup = await Followup.create(body);
    logger.info(`✅ Follow-up created with ID: ${followup._id}`);

    // Sync reminder
    await syncReminder(followup, body);

    return followup;
};

/**
 * Query for follow-ups
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<Object>}
 */
const queryFollowups = async (filter, options) => {
    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 10;
    const skip = (page - 1) * limit;

    // Handle upcoming filter
    if (options.upcoming === 'true' || options.upcoming === true) {
        filter.nextCallDate = { $gte: new Date() };
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
        sort = 'nextCallDate'; // Default sort by upcoming date
    }

    const followups = await Followup.find(filter)
        .populate('customerId', 'name company contactPersons')
        .populate('createdBy', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(limit);

    const totalResults = await Followup.countDocuments(filter);
    const totalPages = Math.ceil(totalResults / limit);

    return {
        results: followups,
        page,
        limit,
        totalPages,
        totalResults
    };
};

/**
 * Get follow-up by id
 * @param {ObjectId} id
 * @returns {Promise<Followup>}
 */
const getFollowupById = async (id) => {
    return Followup.findById(id).populate('customerId', 'name company contactPersons').populate('createdBy', 'name email');
};

/**
 * Get follow-ups by customer ID
 * @param {ObjectId} customerId
 * @returns {Promise<Followup>}
 */
const getFollowupsByCustomer = async (customerId) => {
    return Followup.findOne({ customerId }).populate('customerId', 'name company contactPersons').populate('createdBy', 'name email');
};

/**
 * Update follow-up by id
 * @param {ObjectId} followupId
 * @param {Object} updateBody
 * @returns {Promise<Followup>}
 */
const updateFollowupById = async (followupId, updateBody) => {
    const followup = await getFollowupById(followupId);
    if (!followup) {
        throw new ApiError(404, 'Follow-up not found');
    }

    Object.assign(followup, updateBody);
    await followup.save();

    // Sync reminder
    await syncReminder(followup, updateBody);

    return followup;
};

/**
 * Delete follow-up by id
 * @param {ObjectId} followupId
 * @returns {Promise<Followup>}
 */
const deleteFollowupById = async (followupId) => {
    const followup = await getFollowupById(followupId);
    if (!followup) {
        throw new ApiError(404, 'Follow-up not found');
    }
    await followup.deleteOne();
    return followup;
};

/**
 * Get upcoming follow-ups (due within next 7 days)
 * @returns {Promise<Array>}
 */
const getUpcomingFollowups = async () => {
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    return Followup.find({
        nextCallDate: {
            $gte: today,
            $lte: nextWeek
        }
    })
        .populate('customerId', 'name company contactPersons')
        .populate('createdBy', 'name email')
        .sort('nextCallDate');
};

export default {
    createFollowup,
    queryFollowups,
    getFollowupById,
    getFollowupsByCustomer,
    updateFollowupById,
    deleteFollowupById,
    getUpcomingFollowups,
};
