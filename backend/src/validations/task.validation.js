import Joi from 'joi';

const createTask = {
    body: Joi.object().keys({
        title: Joi.string().required().trim(),
        description: Joi.string().allow('').trim(),
        priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL').default('MEDIUM'),
        status: Joi.string().valid('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE').default('OPEN'),
        assignmentMode: Joi.string().valid('SELF', 'SINGLE', 'MULTI', 'ALL', 'GROUP').default('SELF'),
        assignedGroupId: Joi.string().allow(null, '').optional(),
        taskCategoryId: Joi.string().allow(null, '').optional(),
        group: Joi.string().allow(null, '').optional(),
        assignToAll: Joi.boolean().default(false),
        assigneeIds: Joi.array().items(Joi.string()).optional(),
        dueDate: Joi.date().required(),
        recurrence: Joi.object().keys({
            enabled: Joi.boolean().default(false),
            frequency: Joi.string().valid('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'),
            interval: Joi.number().integer().min(1).default(1),
        }).optional(),
        customerId: Joi.string().allow(null, '').optional(),
    })
};

const getTasks = {
    query: Joi.object().keys({
        group: Joi.string(),
        taskCategoryId: Joi.string(),
        status: Joi.string(),
        priority: Joi.string(),
        view: Joi.string().valid('assigned_to_me', 'created_by_me', 'team', 'group_tasks', 'all'),
        sortBy: Joi.string(),
        limit: Joi.number().integer(),
        page: Joi.number().integer(),
        search: Joi.string().allow('').optional(),
        customerId: Joi.string().allow(null, '').optional(),
    })
};

const getTask = {
    params: Joi.object().keys({
        taskId: Joi.string().required()
    })
};

const updateTask = {
    params: Joi.object().keys({
        taskId: Joi.string().required()
    }),
    body: Joi.object().keys({
        title: Joi.string().trim(),
        description: Joi.string().allow('').trim(),
        priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL'),
        status: Joi.string().valid('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE'),
        assignmentMode: Joi.string().valid('SELF', 'SINGLE', 'MULTI', 'ALL', 'GROUP'),
        assignedGroupId: Joi.string().allow(null, ''),
        taskCategoryId: Joi.string().allow(null, ''),
        assigneeIds: Joi.array().items(Joi.string()),
        assignToAll: Joi.boolean(),
        dueDate: Joi.date(),
        group: Joi.string().allow(null, ''),
        recurrence: Joi.object().keys({
            enabled: Joi.boolean(),
            frequency: Joi.string().valid('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'),
            interval: Joi.number().integer().min(1),
        }),
        customerId: Joi.string().allow(null, ''),
    }).min(1)
};

const deleteTask = {
    params: Joi.object().keys({
        taskId: Joi.string().required()
    })
};

const updateTaskStatus = {
    params: Joi.object().keys({
        taskId: Joi.string().required()
    }),
    body: Joi.object().keys({
        status: Joi.string().valid('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE').required()
    })
};

const extendTask = {
    params: Joi.object().keys({
        taskId: Joi.string().required()
    }),
    body: Joi.object().keys({
        newDueDate: Joi.date().required(),
        reason: Joi.string().required().trim(),
    })
};

const createCategory = {
    body: Joi.object().keys({
        name: Joi.string().required().trim(),
        description: Joi.string().allow('').trim(),
        parentCategory: Joi.string().allow(null, '').optional(),
    })
};

const getCategories = {
    query: Joi.object().keys({
        parentCategory: Joi.string(),
        isActive: Joi.boolean(),
    })
};

export default {
    createTask,
    getTasks,
    getTask,
    updateTask,
    deleteTask,
    updateTaskStatus,
    extendTask,
    createCategory,
    getCategories
};
