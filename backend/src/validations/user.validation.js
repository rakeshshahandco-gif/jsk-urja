import Joi from 'joi';

const createUser = {
    body: Joi.object().keys({
        name: Joi.string().required().trim(),
        username: Joi.string().required().trim().lowercase(),
        email: Joi.string().optional().allow('').email().trim().lowercase(),
        mobile: Joi.string().optional().allow('').trim(),
        password: Joi.string().required().min(6),
        role: Joi.string().valid('admin', 'manager', 'staff', 'viewer').default('viewer'),
        permissions: Joi.array().items(Joi.string()).optional(),
        isActive: Joi.boolean().optional().default(true),
        preferences: Joi.any(),
    }),
};

const getUsers = {
    query: Joi.object().keys({
        name: Joi.string(),
        role: Joi.string(),
        sortBy: Joi.string(),
        limit: Joi.number().integer(),
        page: Joi.number().integer(),
    }),
};

const getUser = {
    params: Joi.object().keys({
        id: Joi.string().hex().length(24).required(),
    }),
};

const updateUser = {
    params: Joi.object().keys({
        id: Joi.string().hex().length(24).required(),
    }),
    body: Joi.object()
        .keys({
            name: Joi.string().trim(),
            username: Joi.string().trim().lowercase(),
            email: Joi.string().email().allow('').trim().lowercase(),
            mobile: Joi.string().allow('').trim(),
            password: Joi.string().min(6),
            role: Joi.string().valid('admin', 'manager', 'staff', 'viewer'),
            permissions: Joi.array().items(Joi.string()),
            isActive: Joi.boolean(),
            preferences: Joi.any(),
        })
        .min(1),
};

const deleteUser = {
    params: Joi.object().keys({
        id: Joi.string().hex().length(24).required(),
    }),
};

export default {
    createUser,
    getUsers,
    getUser,
    updateUser,
    deleteUser,
};
