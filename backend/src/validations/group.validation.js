import Joi from 'joi';
import { objectId } from './custom.validation.js'; // Assuming custom validation exists, or I will use regex

const createGroup = {
    body: Joi.object().keys({
        name: Joi.string().required().trim(),
        code: Joi.string().allow('').trim().uppercase(),
        description: Joi.string().allow('').trim(),
        members: Joi.array().items(Joi.object().keys({
            userId: Joi.string().required(), // using string for ID
            role: Joi.string().valid('OWNER', 'MEMBER').default('MEMBER')
        }))
    })
};

const getGroups = {
    query: Joi.object().keys({
        name: Joi.string(),
        sortBy: Joi.string(),
        limit: Joi.number().integer(),
        page: Joi.number().integer(),
    })
};

const getGroup = {
    params: Joi.object().keys({
        groupId: Joi.string().required() // Basic string check, controller handles ObjectId cast error usually or middleware
    })
};

const updateGroup = {
    params: Joi.object().keys({
        groupId: Joi.string().required()
    }),
    body: Joi.object().keys({
        name: Joi.string().trim(),
        code: Joi.string().allow('').trim().uppercase(),
        description: Joi.string().allow('').trim(),
        isActive: Joi.boolean()
    }).min(1)
};

const deleteGroup = {
    params: Joi.object().keys({
        groupId: Joi.string().required()
    })
};

const addMember = {
    params: Joi.object().keys({
        groupId: Joi.string().required()
    }),
    body: Joi.object().keys({
        userId: Joi.string().required(),
        role: Joi.string().valid('OWNER', 'MEMBER').default('MEMBER')
    })
};

const removeMember = {
    params: Joi.object().keys({
        groupId: Joi.string().required(),
        userId: Joi.string().required()
    })
};

export default {
    createGroup,
    getGroups,
    getGroup,
    updateGroup,
    deleteGroup,
    addMember,
    removeMember
};
