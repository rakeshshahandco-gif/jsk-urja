import Reminder from '../models/reminder.model.js';
import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { createNotification } from '../controllers/notification.controller.js';

/**
 * Create a reminder
 * @param {Object} reminderBody
 * @returns {Promise<Reminder>}
 */
const createReminder = async (reminderBody) => {
    const reminder = await Reminder.create(reminderBody);
    
    // Notify if assigned to someone else (or even if self for real-time unread count update)
    if (reminder.createdBy) {
        await createNotification({
            recipient: reminder.createdBy,
            actor: reminder.createdBy, // In this case actor is self
            type: 'REMINDER',
            title: 'New Reminder Set',
            message: `Reminder for ${reminder.followUpType} with customer. Note: ${reminder.taskNote || 'N/A'}`,
            metadata: { reminderId: reminder._id }
        }).catch(err => console.error('Notification error in createReminder:', err));
    }
    
    return reminder;
};

/**
 * Query for reminders
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryReminders = async (filters, options) => {
    const query = {};

    if (filters.customerId) query.customerId = filters.customerId;
    if (filters.priority) query.priority = filters.priority;
    if (filters.followUpType) query.followUpType = filters.followUpType;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (filters.status) {
        if (filters.status === 'Pending') {
            query.isClosed = false;
            query.reminderDate = { $gte: today };
        } else if (filters.status === 'Overdue') {
            query.isClosed = { $ne: true };
            query.reminderDate = { $lt: today };
        } else if (filters.status === 'Closed') {
            query.isClosed = true;
        } else if (filters.status === 'Today') {
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            query.isClosed = { $ne: true };
            query.reminderDate = { $gte: today, $lt: tomorrow };
        } else if (filters.status === 'Upcoming') {
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            query.isClosed = { $ne: true };
            query.reminderDate = { $gte: tomorrow };
        } else if (filters.status === 'Open') {
            query.isClosed = { $ne: true };
        }
    }

    // Direct isClosed filter (usually from direct frontend params)
    if (filters.isClosed !== undefined) {
        query.isClosed = filters.isClosed === 'true' || filters.isClosed === true;
    }

    if (filters.dateFrom || filters.dateTo) {
        query.reminderDate = query.reminderDate || {};
        if (filters.dateFrom) query.reminderDate.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) query.reminderDate.$lte = new Date(filters.dateTo);
    }

    if (filters.search) {
        // We need to look up customers matching the search name/mobile first
        // Since we can't easily do a $lookup in a simple find query without aggregation,
        // we'll try to find customers first.
        // Or if 'taskNote' is searchable
        const searchRegex = new RegExp(filters.search, 'i');
        // This simple implementation searches taskNote.
        // For customer details search, we'd ideally need aggregation or a separate Customer query.
        // Given the prompt asks for "Customer Name" and "Company Name" search, let's try a basic aggregation approach or 
        // first find matching customers.
        // For simplicity and performance in this existing structure:
        // We will assume 'search' matches taskNote OR we do a two-step lookup.

        // Let's do a two-step lookup for customers if we are searching by customer name/mobile
        // Import Customer model inside the function or file to avoid circular dep if needed, but standard import is fine.
    }

    const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
    const sortBy = options.sortBy || 'reminderDate';
    const sort = { [sortBy]: sortOrder };

    console.log('--- Debug Open Reminders ---');
    console.log('Filters:', JSON.stringify(filters));
    console.log('Query:', JSON.stringify(query));
    console.log('Sort:', JSON.stringify(sort));

    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 10;
    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const skip = (page - 1) * limit;

    let reminders;
    let totalResults;

    const isExport = options.limit === 'all' || options.limit === -1;

    if (filters.search) {
        const searchRegex = new RegExp(filters.search, 'i');

        // Aggregation to filter by customer fields
        const pipeline = [
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customerId',
                    foreignField: '_id',
                    as: 'customer',
                },
            },
            { $unwind: '$customer' },
            {
                $match: {
                    $or: [
                        { 'customer.customerName': searchRegex },
                        { 'customer.company': searchRegex },
                        { 'customer.contactPersons.name': searchRegex },
                        { 'customer.mobile1': searchRegex },  // searching mobile1
                        // mobile search could be broader but starting with mobile1 as per requirement display
                        { taskNote: searchRegex }
                    ],
                    ...query // Apply existing filters
                },
            },
            { $sort: sort },
        ];

        if (!isExport) {
            pipeline.push({ $skip: skip });
            pipeline.push({ $limit: limit });
        }

        // Count pipeline
        const countPipeline = [
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customerId',
                    foreignField: '_id',
                    as: 'customer',
                },
            },
            { $unwind: '$customer' },
            {
                $match: {
                    $or: [
                        { 'customer.customerName': searchRegex },
                        { 'customer.company': searchRegex },
                        { 'customer.contactPersons.name': searchRegex },
                        { 'customer.mobile1': searchRegex },
                        { taskNote: searchRegex }
                    ],
                    ...query
                },
            },
            { $count: 'total' }
        ];

        reminders = await Reminder.aggregate(pipeline);
        const countResult = await Reminder.aggregate(countPipeline);
        totalResults = countResult.length > 0 ? countResult[0].total : 0;

        // Populate is not needed because we looked up, BUT aggregate returns plain objects.
        // If we want consistency with find(), we might want to ensure structure is similar.
        // The lookup puts 'customer' object in the reminder.
        // However, standard .find().populate() leaves 'customerId' as the object.
        // Let's manually map to expected format if needed or just use the result.
        // Usually frontend expects consumer under 'customerId' key if populated.
        reminders = reminders.map(r => ({
            ...r,
            customerId: r.customer,
            customer: undefined
        }));

    } else {
        let queryBuilder = Reminder.find(query)
            .populate('customerId', '_id customerName company companyBrand contactPersons mobile1 mobile2 mobile3 mobile4 mobile5')
            .populate('createdBy', 'name email')
            .sort(sort);

        if (!isExport) {
            queryBuilder = queryBuilder.skip(skip).limit(limit);
        }

        reminders = await queryBuilder;

        totalResults = await Reminder.countDocuments(query);
    }
    const totalPages = isExport ? 1 : Math.ceil(totalResults / limit);

    return {
        results: reminders,
        page,
        limit,
        totalPages,
        totalResults,
    };
};

/**
 * Get reminder by id
 * @param {ObjectId} id
 * @returns {Promise<Reminder>}
 */
const getReminderById = async (id) => {
    return Reminder.findById(id).populate('customerId', 'customerName company companyBrand contactPersons');
};

/**
 * Close a reminder
 * @param {ObjectId} reminderId
 * @returns {Promise<Reminder>}
 */
const closeReminder = async (reminderId) => {
    const reminder = await getReminderById(reminderId);
    if (!reminder) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Reminder not found');
    }

    reminder.isClosed = true;
    reminder.closedAt = new Date();
    await reminder.save();

    // Notify of closure (useful if multiple people track the same customer)
    if (reminder.createdBy) {
        await createNotification({
            recipient: reminder.createdBy,
            actor: reminder.createdBy,
            type: 'REMINDER',
            title: 'Reminder Closed',
            message: `The reminder for customer has been marked as closed.`,
            metadata: { reminderId: reminder._id, status: 'CLOSED' }
        }).catch(err => console.error('Notification error in closeReminder:', err));
    }

    return reminder;
};

/**
 * Extend a reminder
 * @param {ObjectId} reminderId
 * @param {Object} updateBody
 * @returns {Promise<Reminder>}
 */
const extendReminder = async (reminderId, updateBody) => {
    const reminder = await getReminderById(reminderId);
    if (!reminder) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Reminder not found');
    }

    const oldDate = reminder.reminderDate;
    const oldTime = reminder.reminderTime;
    const newDate = new Date(updateBody.reminderDate);
    const newTime = updateBody.reminderTime || oldTime;

    // Track history
    reminder.rescheduleCount = (reminder.rescheduleCount || 0) + 1;
    reminder.rescheduleHistory.push({
        fromDate: oldDate,
        fromTime: oldTime,
        toDate: newDate,
        toTime: newTime,
        changedAt: new Date(),
        reason: updateBody.note || '', // Assuming note passed in body
    });

    reminder.lastReminderDate = oldDate;
    reminder.lastReminderTime = oldTime;
    reminder.rescheduledAt = new Date();

    reminder.extendedFrom = oldDate;
    reminder.extendedTo = newDate;
    reminder.reminderDate = newDate;
    reminder.reminderTime = newTime;

    await reminder.save();

    // Notify of extension
    if (reminder.createdBy) {
        await createNotification({
            recipient: reminder.createdBy,
            actor: reminder.createdBy,
            type: 'REMINDER',
            title: 'Reminder Rescheduled',
            message: `Reminder rescheduled to ${newDate.toLocaleDateString()} at ${newTime}.`,
            metadata: { reminderId: reminder._id, newDate, newTime }
        }).catch(err => console.error('Notification error in extendReminder:', err));
    }

    return reminder;
};

/**
 * Query open reminders with full details (aggregated) for Report
 * @param {Object} filters
 * @param {Object} options
 * @returns {Promise<Object>}
 */
const queryOpenRemindersWithDetails = async (filters, options) => {
    const matchQuery = {};

    // 1. Build Match Query
    if (filters.priority) matchQuery.priority = filters.priority;
    if (filters.followUpType) matchQuery.followUpType = filters.followUpType;
    if (filters.status === 'Open') matchQuery.isClosed = { $ne: true };
    if (filters.status === 'Closed') matchQuery.isClosed = true;

    // Date Logic (Expects Date objects or strings from controller)
    if (filters.dateFrom || filters.dateTo) {
        matchQuery.reminderDate = {};
        if (filters.dateFrom) matchQuery.reminderDate.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) matchQuery.reminderDate.$lte = new Date(filters.dateTo);
    }

    // Search is complex in aggregation if purely regex, best passed as pre-resolved IDs or use match on looked-up fields
    // For simplicity/performance, if search is present, we might rely on the controller or handle it after lookup (expensive)
    // or use a separate $match after lookup. Let's do $match after lookup for search.

    const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
    const sortBy = options.sortBy || 'reminderDate';
    const sort = { [sortBy]: sortOrder };

    const limit = parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 10;
    const page = parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const skip = (page - 1) * limit;

    const pipeline = [
        { $match: matchQuery },
        // Lookup Customer
        {
            $lookup: {
                from: 'customers',
                localField: 'customerId',
                foreignField: '_id',
                as: 'customerRaw'
            }
        },
        { $unwind: { path: '$customerRaw', preserveNullAndEmptyArrays: true } },

        // Lookup Creator
        {
            $lookup: {
                from: 'users',
                localField: 'createdBy',
                foreignField: '_id',
                as: 'creatorRaw'
            }
        },
        { $unwind: { path: '$creatorRaw', preserveNullAndEmptyArrays: true } },

        // Search Filter (applied after lookup if 'q' is present)
        ...(filters.search ? [{
            $match: {
                $or: [
                    { 'customerRaw.company': { $regex: filters.search, $options: 'i' } },
                    { 'customerRaw.customerName': { $regex: filters.search, $options: 'i' } },
                    { 'customerRaw.mobile1': { $regex: filters.search, $options: 'i' } },
                    { 'taskNote': { $regex: filters.search, $options: 'i' } }
                ]
            }
        }] : []),

        // Lookup Last Conversation
        {
            $lookup: {
                from: 'conversations',
                let: { custId: '$customerId' },
                pipeline: [
                    { $match: { $expr: { $eq: ['$customerId', '$$custId'] } } },
                    { $sort: { conversationDate: -1, createdAt: -1 } },
                    { $limit: 1 }
                ],
                as: 'lastConversationRaw'
            }
        },

        // Project Final Shape
        {
            $project: {
                _id: 1,
                // Flatten customer info for easy frontend consumption
                customerId: '$customerRaw._id', // Keep raw ID for keys/links
                customerRaw: 1, // Keep full object just in case or map manually specific fields
                // Or better, let's map 'customerId' to be the object like populate() does for compatibility
                companyName: '$customerRaw.company',
                customerName: '$customerRaw.customerName',
                primaryContact: { $arrayElemAt: ['$customerRaw.contactPersons', 0] }, // Simplify

                reminderDate: 1,
                reminderTime: 1,
                followUpType: 1,
                priority: 1,
                isClosed: 1,
                taskNote: 1,
                // Creator info
                createdBy: {
                    name: '$creatorRaw.name',
                    email: '$creatorRaw.email'
                },
                // Mapped Alias
                whatToTalkNext: '$taskNote',
                lastConversation: { $arrayElemAt: ['$lastConversationRaw', 0] }
            }
        },

        // Format Result similar to populate
        {
            $addFields: {
                customerId: {
                    _id: '$customerId',
                    company: '$companyName',
                    customerName: '$customerName',
                    // Add other fields if strictly needed by table, usually company/contact needed
                    contactPersons: '$customerRaw.contactPersons'
                }
            }
        }
    ];

    // Count Total (Running separate aggregation or using facet)
    // Facet is best for single query
    const facetedPipeline = [
        ...pipeline,
        {
            $facet: {
                metadata: [{ $count: 'total' }],
                data: [{ $sort: sort }, { $skip: skip }, { $limit: limit }]
            }
        }
    ];

    const result = await Reminder.aggregate(facetedPipeline);

    // Parse Facet Result
    const data = result[0].data || [];
    const total = result[0].metadata[0] ? result[0].metadata[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    return {
        results: data, // maintain 'results' key convention
        page,
        limit,
        totalPages,
        totalResults: total
    };
};
/**
 * Upsert reminder for customer
 * @param {ObjectId} customerId
 * @param {Object} reminderData
 * @returns {Promise<Reminder>}
 */
const upsertReminderForCustomer = async (customerId, reminderData) => {
    const isReminderEnabled = reminderData.reminderEnabled !== undefined ? reminderData.reminderEnabled : reminderData.enableReminder;

    if (isReminderEnabled) {
        // Upsert open reminder
        const reminder = await Reminder.findOneAndUpdate(
            {
                customerId: customerId,
                isClosed: false
            },
            {
                customerId: customerId,
                conversationId: reminderData.conversationId,
                reminderDate: reminderData.nextCallDate,
                reminderTime: reminderData.nextCallTime || '10:00',
                followUpType: reminderData.followUpType,
                taskNote: reminderData.whatToTalkNext || reminderData.note, // Supports both 'whatToTalkNext' and 'note'
                priority: reminderData.priority,
                isClosed: false,
                createdBy: reminderData.createdBy
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        if (reminder && reminder.createdBy) {
            await createNotification({
                recipient: reminder.createdBy,
                actor: reminder.createdBy,
                type: 'REMINDER',
                title: 'Reminder Created/Updated',
                message: `Task: ${reminder.taskNote || 'N/A'} for ${reminder.followUpType}`,
                metadata: { reminderId: reminder._id }
            }).catch(err => console.error('Notification error in upsertReminderForCustomer:', err));
        }
        return reminder;
    } else {
        // Close any open reminders if disabled
        await Reminder.updateMany(
            { customerId: customerId, isClosed: false },
            { isClosed: true, closedAt: new Date() }
        );
        return null;
    }
};

/**
 * Get counts for reminders by status (Today, Upcoming, Overdue)
 * @returns {Promise<Object>}
 */
const getReminderCounts = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const counts = await Reminder.aggregate([
        {
            $facet: {
                today: [
                    { $match: { isClosed: { $ne: true }, reminderDate: { $gte: today, $lt: tomorrow } } },
                    { $count: 'count' }
                ],
                upcoming: [
                    { $match: { isClosed: { $ne: true }, reminderDate: { $gte: tomorrow } } },
                    { $count: 'count' }
                ],
                overdue: [
                    { $match: { isClosed: { $ne: true }, reminderDate: { $lt: today } } },
                    { $count: 'count' }
                ]
            }
        },
        {
            $project: {
                today: { $ifNull: [{ $arrayElemAt: ['$today.count', 0] }, 0] },
                upcoming: { $ifNull: [{ $arrayElemAt: ['$upcoming.count', 0] }, 0] },
                overdue: { $ifNull: [{ $arrayElemAt: ['$overdue.count', 0] }, 0] }
            }
        }
    ]);

    return counts[0] || { today: 0, upcoming: 0, overdue: 0 };
};

export default {
    createReminder,
    queryReminders,
    getReminderById,
    closeReminder,
    extendReminder,
    upsertReminderForCustomer,
    queryOpenRemindersWithDetails,
    getReminderCounts,
};
