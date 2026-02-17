import httpStatus from 'http-status';
import { TaskGroup } from '../models/taskGroup.model.js';
import { TaskGroupItem } from '../models/taskGroupItem.model.js';
import { Task } from '../models/task.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import pick from '../utils/pick.js';

// Create a template with items
const createTemplate = asyncHandler(async (req, res) => {
    const { name, recurrence, recurrenceRule, assignToAll, assigneeIds, items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'At least one item is required for a template');
    }

    const groupData = {
        name,
        kind: 'TEMPLATE',
        recurrence: recurrence || 'NONE',
        recurrenceRule: recurrenceRule || null,
        assignToAll: !!assignToAll,
        assigneeIds: assignToAll ? [] : (assigneeIds || []),
        createdBy: req.user.id,
    };

    const group = await TaskGroup.create(groupData);

    const groupItems = items.map((item, index) => ({
        groupTemplateId: group._id,
        title: item.title,
        notes: item.notes || '',
        amount: item.amount || 0,
        dueOffsetDays: item.dueOffsetDays || 0,
        sortOrder: item.sortOrder || index,
    }));

    const createdItems = await TaskGroupItem.insertMany(groupItems);

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, { group, items: createdItems }, 'Template created successfully'));
});

// Generate instance from template
const generateInstance = asyncHandler(async (req, res) => {
    const { templateId } = req.params;
    const { period } = req.body; // YYYY-MM

    const template = await TaskGroup.findById(templateId);
    if (!template || template.kind !== 'TEMPLATE') {
        throw new ApiError(httpStatus.NOT_FOUND, 'Template not found');
    }

    const items = await TaskGroupItem.find({ groupTemplateId: templateId }).sort({ sortOrder: 1 });
    if (items.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Template has no items');
    }

    // Create Instance
    const instance = await TaskGroup.create({
        name: `${template.name} (${period})`,
        kind: 'INSTANCE',
        templateId: template._id,
        period,
        assignToAll: template.assignToAll,
        assigneeIds: template.assigneeIds,
        createdBy: req.user.id,
    });

    // Calculate base date from period
    const [year, month] = period.split('-').map(Number);
    const baseDate = new Date(year, month - 1, 1);

    // Get day of month from recurrence rule if exists, default to 1
    let dayOfMonth = 1;
    if (template.recurrenceRule && template.recurrenceRule.dayOfMonth) {
        dayOfMonth = template.recurrenceRule.dayOfMonth;
    }

    const createdTasks = [];
    for (const item of items) {
        const dueDate = new Date(year, month - 1, dayOfMonth + item.dueOffsetDays);

        const taskData = {
            title: item.title,
            description: item.notes || '',
            dueDate,
            priority: 'MEDIUM',
            status: 'OPEN',
            groupId: instance._id,
            groupItemId: item._id,
            assignToAll: template.assignToAll,
            assigneeIds: template.assigneeIds,
            assignedTo: template.assignToAll ? null : template.assigneeIds[0],
            createdBy: req.user.id,
        };

        const task = await Task.create(taskData);
        createdTasks.push(task);
    }

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, { instance, tasks: createdTasks }, 'Instance generated successfully'));
});

// List Groups (Templates/Instances)
const getGroups = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['kind', 'templateId']);
    const result = await TaskGroup.find(filter).sort({ createdAt: -1 });
    res.send(new ApiResponse(httpStatus.OK, result, 'Groups fetched successfully'));
});

// Get Single Group with Items/Tasks
const getGroup = asyncHandler(async (req, res) => {
    const group = await TaskGroup.findById(req.params.groupId);
    if (!group) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');
    }

    const items = await TaskGroupItem.find({ groupTemplateId: group._id }).sort({ sortOrder: 1 });

    let tasks = [];
    if (group.kind === 'INSTANCE') {
        tasks = await Task.find({ groupId: group._id }).sort({ dueDate: 1 });
    }

    res.send(new ApiResponse(httpStatus.OK, { group, items, tasks }, 'Group details fetched successfully'));
});

export default {
    createTemplate,
    generateInstance,
    getGroups,
    getGroup,
};
