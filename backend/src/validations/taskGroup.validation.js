import Joi from 'joi';

const highlightStyle = Joi.string().valid(
    'blue', 'teal', 'indigo', 'amber', 'rose', 'violet', 'emerald', 'slate',
);
const recurrenceType = Joi.string().valid(
    'NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY',
);
const priority = Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL');

const sampleTask = Joi.object().keys({
    _id: Joi.string().optional().allow(null, ''),
    title: Joi.string().required().trim(),
    notes: Joi.string().allow('').trim(),
    description: Joi.string().allow('').trim(),
    dueDayRule: Joi.string().allow('').trim(),
    dueOffsetDays: Joi.number().integer().optional(),
    priority: priority.optional(),
    recurrenceType: recurrenceType.optional(),
    checklist: Joi.array().items(Joi.string()).optional(),
    responsibleRole: Joi.string().allow('').trim(),
    isActive: Joi.boolean().optional(),
    sortOrder: Joi.number().integer().optional(),
});

const groupBodyFields = {
    name: Joi.string().trim(),
    notes: Joi.string().allow('').trim(),
    groupType: Joi.string().allow('').trim(),
    visibility: Joi.string().valid('PRIVATE', 'TEAM', 'COMPANY'),
    userIds: Joi.array().items(Joi.string()).optional(),
    coordinatorId: Joi.string().allow(null, '').optional(),
    recurrenceType: recurrenceType.optional(),
    recurrenceInterval: Joi.number().integer().min(1).optional(),
    recurrenceStartDate: Joi.date().allow(null).optional(),
    recurrenceEndDate: Joi.date().allow(null).optional(),
    defaultPriority: priority.optional(),
    isActive: Joi.boolean().optional(),
    showInTaskHub: Joi.boolean().optional(),
    isHighlighted: Joi.boolean().optional(),
    highlightOrder: Joi.number().integer().min(0).optional(),
    highlightIcon: Joi.string().allow('').trim(),
    highlightStyle: highlightStyle.optional(),
    showInGeneralTaskLists: Joi.boolean().optional(),
    notifyAllMembers: Joi.boolean().optional(),
    allowMembersUpdate: Joi.boolean().optional(),
    isDefaultSelected: Joi.boolean().optional(),
    sampleTasks: Joi.array().items(sampleTask).optional(),
};

const createGroup = {
    body: Joi.object().keys({
        ...groupBodyFields,
        name: Joi.string().required().trim(),
        visibility: Joi.string().valid('PRIVATE', 'TEAM', 'COMPANY').default('COMPANY'),
    }),
};

const getGroups = {
    query: Joi.object().keys({
        name: Joi.string(),
        visibility: Joi.string().valid('PRIVATE', 'TEAM', 'COMPANY'),
        highlighted: Joi.boolean(),
        active: Joi.boolean(),
        sortBy: Joi.string(),
        limit: Joi.number().integer(),
        page: Joi.number().integer(),
    }),
};

const getGroup = {
    params: Joi.object().keys({
        groupId: Joi.string().required(),
    }),
};

const updateGroup = {
    params: Joi.object().keys({
        groupId: Joi.string().required(),
    }),
    body: Joi.object().keys(groupBodyFields).min(1),
};

const deleteGroup = {
    params: Joi.object().keys({
        groupId: Joi.string().required(),
    }),
};

const reorderHighlights = {
    body: Joi.object().keys({
        orderedIds: Joi.array().items(Joi.string().required()).min(1).required(),
    }),
};

export default {
    createGroup,
    getGroups,
    getGroup,
    updateGroup,
    deleteGroup,
    reorderHighlights,
};
