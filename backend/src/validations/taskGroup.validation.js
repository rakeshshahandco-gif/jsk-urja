import Joi from 'joi';

const createGroup = {
    body: Joi.object().keys({
        name: Joi.string().required().trim(),
        notes: Joi.string().allow('').trim(),
        visibility: Joi.string().valid('PRIVATE', 'TEAM', 'COMPANY').default('COMPANY'),
        userIds: Joi.array().items(Joi.string()).optional(),
    })
};

const getGroups = {
    query: Joi.object().keys({
        name: Joi.string(),
        visibility: Joi.string().valid('PRIVATE', 'TEAM', 'COMPANY'),
        sortBy: Joi.string(),
        limit: Joi.number().integer(),
        page: Joi.number().integer(),
    })
};

const getGroup = {
    params: Joi.object().keys({
        groupId: Joi.string().required()
    })
};

const updateGroup = {
    params: Joi.object().keys({
        groupId: Joi.string().required()
    }),
    body: Joi.object().keys({
        name: Joi.string().trim(),
        notes: Joi.string().allow('').trim(),
        visibility: Joi.string().valid('PRIVATE', 'TEAM', 'COMPANY'),
        userIds: Joi.array().items(Joi.string()).optional(),
    }).min(1)
};

const deleteGroup = {
    params: Joi.object().keys({
        groupId: Joi.string().required()
    })
};

export default {
    createGroup,
    getGroups,
    getGroup,
    updateGroup,
    deleteGroup
};
