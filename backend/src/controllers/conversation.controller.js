import pick from '../utils/pick.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import conversationService from '../services/conversation.service.js';

const catchAsync = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

const createConversation = catchAsync(async (req, res) => {
    if (!req.body.customerId) {
        throw new ApiError(400, 'Customer ID is required to save conversation');
    }
    console.log(`💾 Saving conversation for customer: ${req.body.customerId}`);
    const conversation = await conversationService.createConversation(req.body);
    res.status(201).send(new ApiResponse(201, conversation, 'Conversation created successfully'));
});

const getConversations = catchAsync(async (req, res) => {
    const filter = pick(req.query, ['customerId', 'mode']);
    const options = pick(req.query, ['sortBy', 'limit', 'page', 'startDate', 'endDate']);
    const result = await conversationService.queryConversations(filter, options);
    res.send(new ApiResponse(200, result, 'Conversations fetched successfully'));
});

const getConversation = catchAsync(async (req, res) => {
    const conversation = await conversationService.getConversationById(req.params.conversationId);
    if (!conversation) {
        throw new ApiError(404, 'Conversation not found');
    }
    res.send(new ApiResponse(200, conversation));
});

const getConversationsByCustomer = catchAsync(async (req, res) => {
    const options = pick(req.query, ['limit', 'page']);
    const result = await conversationService.getConversationsByCustomer(req.params.customerId, options);
    res.send(new ApiResponse(200, result, 'Customer conversations fetched successfully'));
});

const updateConversation = catchAsync(async (req, res) => {
    const conversation = await conversationService.updateConversationById(req.params.conversationId, req.body);
    res.send(new ApiResponse(200, conversation, 'Conversation updated successfully'));
});

const deleteConversation = catchAsync(async (req, res) => {
    await conversationService.deleteConversationById(req.params.conversationId);
    res.status(200).send(new ApiResponse(200, null, 'Conversation deleted successfully'));
});

export default {
    createConversation,
    getConversations,
    getConversation,
    getConversationsByCustomer,
    updateConversation,
    deleteConversation,
};
