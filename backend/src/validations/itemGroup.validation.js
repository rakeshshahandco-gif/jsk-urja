import Joi from 'joi';

const createItemGroup = {
    body: Joi.object().keys({
        name: Joi.string().required().trim(),
        code: Joi.string().required().trim().uppercase(),
        description: Joi.string().allow('').optional().trim(),
        isActive: Joi.boolean().optional(),
    }),
};

const getItemGroups = {
    query: Joi.object().keys({
        isActive: Joi.boolean().optional(),
        sortBy: Joi.string().optional(),
        limit: Joi.number().integer().optional(),
        page: Joi.number().integer().optional(),
    }),
};

const getItemGroup = {
    params: Joi.object().keys({
        id: Joi.string().required(),
    }),
};

const updateItemGroup = {
    params: Joi.object().keys({
        id: Joi.string().required(),
    }),
    body: Joi.object().keys({
        name: Joi.string().optional().trim(),
        code: Joi.string().optional().trim().uppercase(),
        description: Joi.string().allow('').optional().trim(),
        isActive: Joi.boolean().optional(),
    }).min(1),
};

const deleteItemGroup = {
    params: Joi.object().keys({
        id: Joi.string().required(),
    }),
};

export default {
    createItemGroup,
    getItemGroups,
    getItemGroup,
    updateItemGroup,
    deleteItemGroup,
};
