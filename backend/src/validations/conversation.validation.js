import Joi from 'joi';

const createConversation = {
    body: Joi.object().keys({
        customerId: Joi.string().hex().length(24).required().messages({
            'string.hex': 'Invalid Customer ID format',
            'string.length': 'Invalid Customer ID'
        }),
        conversationDate: Joi.date().optional().default(Date.now),
        mode: Joi.string().valid('call', 'whatsapp', 'visit', 'email').required().messages({
            'any.only': 'Mode must be one of: call, whatsapp, visit, email'
        }),
        discussionDetails: Joi.string().required().min(5).messages({
            'string.min': 'Discussion details must be at least 5 characters'
        }),
        outcome: Joi.string().optional().allow(''),
    }),
};

const getConversations = {
    query: Joi.object().keys({
        customerId: Joi.string().hex().length(24),
        mode: Joi.string().valid('call', 'whatsapp', 'visit', 'email'),
        startDate: Joi.date(),
        endDate: Joi.date(),
        sortBy: Joi.string(),
        limit: Joi.number().integer().min(1).max(100),
        page: Joi.number().integer().min(1),
    }),
};

const getConversation = {
    params: Joi.object().keys({
        conversationId: Joi.string().hex().length(24).required().messages({
            'string.hex': 'Invalid Conversation ID format',
            'string.length': 'Invalid Conversation ID'
        }),
    }),
};

const getConversationsByCustomer = {
    params: Joi.object().keys({
        customerId: Joi.string().hex().length(24).required().messages({
            'string.hex': 'Invalid Customer ID format',
            'string.length': 'Invalid Customer ID'
        }),
    }),
    query: Joi.object().keys({
        limit: Joi.number().integer().min(1).max(100),
        page: Joi.number().integer().min(1),
    }),
};

const updateConversation = {
    params: Joi.object().keys({
        conversationId: Joi.string().hex().length(24).required(),
    }),
    body: Joi.object()
        .keys({
            conversationDate: Joi.date(),
            mode: Joi.string().valid('call', 'whatsapp', 'visit', 'email'),
            discussionDetails: Joi.string().min(5),
            outcome: Joi.string().allow(''),
        })
        .min(1),
};

const deleteConversation = {
    params: Joi.object().keys({
        conversationId: Joi.string().hex().length(24).required(),
    }),
};

export default {
    createConversation,
    getConversations,
    getConversation,
    getConversationsByCustomer,
    updateConversation,
    deleteConversation,
};
