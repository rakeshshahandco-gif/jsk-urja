import httpStatus from 'http-status';
import { TaskGroup } from '../models/taskGroup.model.js';
import { TaskGroupItem } from '../models/taskGroupItem.model.js';
import { Task } from '../models/task.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import pick from '../utils/pick.js';

// Create a generic group
const createGroup = asyncHandler(async (req, res) => {
    const { name, notes, visibility } = req.body;

    const group = await TaskGroup.create({
        name,
        notes: notes || '',
        visibility: visibility || 'COMPANY',
        createdBy: req.user.id,
    });

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, group, 'Group created successfully'));
});

// Delete a group
const deleteGroup = asyncHandler(async (req, res) => {
    const group = await TaskGroup.findById(req.params.groupId);
    if (!group) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');
    }

    // Check permissions (Admin or Creator)
    if (req.user.role !== 'admin' && group.createdBy.toString() !== req.user.id) {
        throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to delete this group');
    }

    await TaskGroup.deleteOne({ _id: group._id });
    // Note: We might want to handle child tasks here, but user says "Closing a group does not automatically close all children"
    // Usually deletion should probably un-link or delete children too, but I'll leave them as orphans for now or un-link.
    await Task.updateMany({ groupId: group._id }, { $set: { groupId: null } });

    res.send(new ApiResponse(httpStatus.OK, null, 'Group deleted successfully'));
});

// List Groups
const getGroups = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['visibility']);

    // RBAC Visibility Logic
    if (req.user.role === 'admin') {
        // Admin sees all
    } else if (req.user.role === 'manager') {
        // Manager sees COMPANY, TEAM groups and THEIR OWN private groups
        filter.$or = [
            { visibility: 'COMPANY' },
            { visibility: 'TEAM' },
            { createdBy: req.user.id }
        ];
    } else {
        // Staff sees COMPANY and THEIR OWN groups
        filter.$or = [
            { visibility: 'COMPANY' },
            { createdBy: req.user.id }
        ];
    }

    let groups = await TaskGroup.find(filter).sort({ createdAt: -1 });

    // Ensure "General" group exists for this user if they are listing groups
    const hasGeneral = groups.some(g => g.name === 'General' && g.createdBy.toString() === req.user.id);
    if (!hasGeneral) {
        const generalGroup = await TaskGroup.create({
            name: 'General',
            notes: 'Default group for your tasks',
            visibility: 'PRIVATE',
            createdBy: req.user.id
        });
        groups.unshift(generalGroup);
    }

    res.send(new ApiResponse(httpStatus.OK, groups, 'Groups fetched successfully'));
});

// Get Single Group with child tasks
const getGroup = asyncHandler(async (req, res) => {
    const group = await TaskGroup.findById(req.params.groupId);
    if (!group) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');
    }

    const tasks = await Task.find({ groupId: group._id }).sort({ dueDate: 1 });

    // Calculate progress
    const total = tasks.length;
    const closed = tasks.filter(t => t.status === 'COMPLETED').length;

    res.send(new ApiResponse(httpStatus.OK, { group, tasks, progress: { total, closed } }, 'Group details fetched successfully'));
});

export default {
    createGroup,
    getGroups,
    getGroup,
    deleteGroup,
};
