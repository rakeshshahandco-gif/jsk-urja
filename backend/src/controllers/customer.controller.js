import mongoose from 'mongoose';
import pick from '../utils/pick.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import customerService from '../services/customer.service.js';
import conversationService from '../services/conversation.service.js';
import Followup from '../models/followup.model.js';
import Conversation from '../models/conversation.model.js';
import Reminder from '../models/reminder.model.js';

const catchAsync = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

const createCustomer = catchAsync(async (req, res) => {
    const customer = await customerService.createCustomer(req.body);
    res.status(201).send(new ApiResponse(201, customer, 'Customer created successfully'));
});

const getCustomers = catchAsync(async (req, res) => {
    console.log('Customers API hit with query:', req.query);
    const filter = pick(req.query, ['customerName', 'status']);
    const options = pick(req.query, ['sortBy', 'limit', 'page', 'search']);
    const result = await customerService.queryCustomers(filter, options);
    res.send(new ApiResponse(200, result, 'Customers fetched successfully'));
});

const getCustomer = catchAsync(async (req, res) => {
    const customer = await customerService.getCustomerById(req.params.id);
    if (!customer) {
        throw new ApiError(404, 'Customer not found');
    }
    res.send(new ApiResponse(200, customer));
});

const getCustomerConversations = catchAsync(async (req, res) => {
    const options = pick(req.query, ['sortBy', 'limit', 'page']);
    const result = await conversationService.getConversationsByCustomer(req.params.id, options);
    res.send(new ApiResponse(200, result, 'Customer conversations fetched successfully'));
});

const getConversationHistory = catchAsync(async (req, res) => {
    const { customerId } = req.params;
    const { fromDate, toDate, mode, search } = req.query;

    console.log(`📜 Fetching history for customer: ${customerId}, Filters:`, req.query);

    let id;
    try {
        id = new mongoose.Types.ObjectId(customerId);
    } catch (err) {
        throw new ApiError(400, 'Invalid Customer ID');
    }

    // Build Filters
    const convQuery = { customerId: id };
    const followupQuery = { customerId: id };

    // 1. Date Filter
    if (fromDate || toDate) {
        const dateFilter = {};
        if (fromDate) dateFilter.$gte = new Date(fromDate);
        if (toDate) {
            const end = new Date(toDate);
            end.setHours(23, 59, 59, 999);
            dateFilter.$lte = end;
        }
        convQuery.conversationDate = dateFilter;
        followupQuery.updatedAt = dateFilter; // Use updatedAt for followups
    }

    // 2. Mode Filter
    if (mode && mode !== 'All') {
        // Conversation uses lowercase: 'call', 'whatsapp'
        // Followup uses uppercase: 'CALL', 'WHATSAPP'
        convQuery.mode = mode.toLowerCase();
        followupQuery.followUpType = mode.toUpperCase();
    }

    // 3. Search Filter
    if (search) {
        const searchRegex = { $regex: search, $options: 'i' };
        convQuery.$or = [
            { discussionDetails: searchRegex },
            { outcome: searchRegex }
        ];
        followupQuery.whatToTalkNext = searchRegex;
    }

    // Fetch from Conversations
    const conversations = await Conversation.find(convQuery)
        .sort({ conversationDate: -1, createdAt: -1 })
        .lean();
    console.log(`✅ Found ${conversations.length} records in Conversation model`);

    // Fetch from Followups
    const followups = await Followup.find(followupQuery)
        .sort({ updatedAt: -1 })
        .lean();
    console.log(`✅ Found ${followups.length} records in Followup model`);

    const followupHistory = followups.map(f => ({
        _id: f._id,
        conversationDate: f.updatedAt,
        mode: f.followUpType === 'WHATSAPP' ? 'whatsapp' : 'call',
        discussionDetails: `[Follow-up] ${f.whatToTalkNext || 'No remarks'}`,
        outcome: `Next Call: ${f.nextCallDate ? new Date(f.nextCallDate).toISOString().split('T')[0] : 'N/A'}`,
        createdAt: f.createdAt,
        isFollowup: true
    }));

    // Fetch from Reminders (History & Closed)
    const reminders = await Reminder.find({ customerId: id }).lean();
    console.log(`✅ Found ${reminders.length} records in Reminder model`);

    const reminderHistory = [];

    reminders.forEach(r => {
        // 1. Reschedule History
        if (r.rescheduleHistory && r.rescheduleHistory.length > 0) {
            r.rescheduleHistory.forEach(h => {
                // Apply Date Filter to history items if needed
                let include = true;
                if (fromDate && new Date(h.changedAt) < new Date(fromDate)) include = false;
                if (toDate) {
                    const end = new Date(toDate);
                    end.setHours(23, 59, 59, 999);
                    if (new Date(h.changedAt) > end) include = false;
                }

                if (include) {
                    reminderHistory.push({
                        _id: h._id || `${r._id}_res_${h.changedAt.getTime()}`,
                        conversationDate: h.changedAt,
                        mode: 'Rescheduled',
                        discussionDetails: `Date changed from ${h.fromDate ? new Date(h.fromDate).toLocaleDateString() : 'N/A'} to ${h.toDate ? new Date(h.toDate).toLocaleDateString() : 'N/A'}`,
                        outcome: h.reason ? `Reason: ${h.reason}` : 'No reason provided',
                        createdAt: h.changedAt,
                        isSystem: true
                    });
                }
            });
        }

        // 2. Closed History
        if (r.isClosed && r.closedAt) {
            let include = true;
            if (fromDate && new Date(r.closedAt) < new Date(fromDate)) include = false;
            if (toDate) {
                const end = new Date(toDate);
                end.setHours(23, 59, 59, 999);
                if (new Date(r.closedAt) > end) include = false;
            }

            if (include) {
                reminderHistory.push({
                    _id: `${r._id}_closed`,
                    conversationDate: r.closedAt,
                    mode: 'Task Closed',
                    discussionDetails: `Task marked as closed/completed.`,
                    outcome: r.taskNote ? `Note: ${r.taskNote}` : '',
                    createdAt: r.closedAt,
                    isSystem: true
                });
            }
        }

        // 3. Open/Due Task (showing the reminder itself as an event)
        // This ensures even if no action is taken, the scheduled task appears in history
        if (!r.isClosed) {
            let include = true;
            // For open tasks, we use reminderDate
            if (fromDate && new Date(r.reminderDate) < new Date(fromDate)) include = false;
            if (toDate) {
                const end = new Date(toDate);
                end.setHours(23, 59, 59, 999);
                if (new Date(r.reminderDate) > end) include = false;
            }

            if (include) {
                reminderHistory.push({
                    _id: `${r._id}_open`,
                    conversationDate: r.reminderDate,
                    mode: 'Scheduled Task',
                    discussionDetails: `Task Due: ${r.taskNote || 'No description'}`,
                    outcome: `Status: ${r.priority} Priority`,
                    createdAt: r.createdAt,
                    isSystem: true
                });
            }
        }
    });

    // Merge and Sort
    const mergedHistory = [...conversations, ...followupHistory, ...reminderHistory].sort((a, b) => {
        return new Date(b.conversationDate) - new Date(a.conversationDate);
    });

    res.send(new ApiResponse(200, mergedHistory, 'History fetched successfully'));
});

const updateCustomer = catchAsync(async (req, res) => {
    console.log('📝 PUT /customers/:id called with ID:', req.params.id);
    console.log('📝 Request body:', JSON.stringify(req.body, null, 2));

    const customer = await customerService.updateCustomerById(req.params.id, req.body);

    console.log('✅ Customer updated in DB:', customer._id);
    res.send(new ApiResponse(200, customer, 'Customer updated successfully'));
});

const deleteCustomer = catchAsync(async (req, res) => {
    await customerService.deleteCustomerById(req.params.id);
    res.status(200).send(new ApiResponse(200, null, 'Customer deleted successfully'));
});

export default {
    createCustomer,
    getCustomers,
    getCustomer,
    getCustomerConversations,
    getConversationHistory,
    updateCustomer,
    deleteCustomer,
};
