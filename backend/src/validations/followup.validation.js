import Joi from 'joi';

const createFollowup = {
    body: Joi.object().keys({
        customerId: Joi.string().hex().length(24).required().messages({
            'string.hex': 'Invalid Customer ID format',
            'string.length': 'Invalid Customer ID'
        }),
        nextCallDate: Joi.date().required().messages({
            'date.base': 'Next call date must be a valid date'
        }),
        nextCallTime: Joi.string().optional().allow('').pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).messages({
            'string.pattern.base': 'Time must be in HH:MM format (24-hour)'
        }),
        whatToTalkNext: Joi.string().optional().allow(''),
        priority: Joi.string().valid('high', 'medium', 'low').optional(),
        reminderEnabled: Joi.boolean().optional(),
        followUpType: Joi.string().valid('CALL', 'WHATSAPP').optional().default('CALL'),
        conversationId: Joi.string().hex().length(24).optional().allow(null, ''),
    }),
};

const getFollowups = {
    query: Joi.object().keys({
        customerId: Joi.string().hex().length(24),
        priority: Joi.string().valid('high', 'medium', 'low'),
        sortBy: Joi.string(),
        limit: Joi.number().integer().min(1).max(100),
        page: Joi.number().integer().min(1),
        upcoming: Joi.boolean(), // Filter for upcoming follow-ups
    }),
};

const getFollowup = {
    params: Joi.object().keys({
        followupId: Joi.string().hex().length(24).required().messages({
            'string.hex': 'Invalid Followup ID format',
            'string.length': 'Invalid Followup ID'
        }),
    }),
};

const getFollowupsByCustomer = {
    params: Joi.object().keys({
        customerId: Joi.string().hex().length(24).required().messages({
            'string.hex': 'Invalid Customer ID format',
            'string.length': 'Invalid Customer ID'
        }),
    }),
};

const updateFollowup = {
    params: Joi.object().keys({
        followupId: Joi.string().hex().length(24).required(),
    }),
    body: Joi.object()
        .keys({
            nextCallDate: Joi.date(),
            nextCallTime: Joi.string().allow('').pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
            whatToTalkNext: Joi.string().allow(''),
            priority: Joi.string().valid('high', 'medium', 'low'),
            reminderEnabled: Joi.boolean(),
            followUpType: Joi.string().valid('CALL', 'WHATSAPP'),
            customerId: Joi.string().hex().length(24), // Allowed but likely ignored by update logic if redundant
            conversationId: Joi.string().hex().length(24).allow(null, ''),
        })
        .min(1),
};

const deleteFollowup = {
    params: Joi.object().keys({
        followupId: Joi.string().hex().length(24).required(),
    }),
};

export default {
    createFollowup,
    getFollowups,
    getFollowup,
    getFollowupsByCustomer,
    updateFollowup,
    deleteFollowup,
};
