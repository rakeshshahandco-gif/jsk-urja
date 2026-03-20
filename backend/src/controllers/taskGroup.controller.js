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
    const { name, notes, visibility, userIds } = req.body;

    let finalUserIds = Array.isArray(userIds) ? [...userIds] : [];

    // Automatically add the creator to the group members so they can see tasks assigned to it
    if (!finalUserIds.includes(req.user.id)) {
        finalUserIds.push(req.user.id);
    }

    const group = await TaskGroup.create({
        name,
        notes: notes || '',
        userIds: finalUserIds,
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

    // Check permissions removed - all users can delete groups

    await TaskGroup.deleteOne({ _id: group._id });
    // Note: We might want to handle child tasks here, but user says "Closing a group does not automatically close all children"
    // Usually deletion should probably un-link or delete children too, but I'll leave them as orphans for now or un-link.
    await Task.updateMany({ groupId: group._id }, { $set: { groupId: null } });

    res.send(new ApiResponse(httpStatus.OK, null, 'Group deleted successfully'));
});

// List Groups — admins see all; users see only groups they created, are members of, or have tasks in
const getGroups = asyncHandler(async (req, res) => {
    let groups;

    if (req.user.role === 'admin') {
        // Admin only: show all groups
        groups = await TaskGroup.find({}).populate('userIds', 'name email').sort({ name: 1 });
    } else {
        const userId = req.user._id;

        // Find groupIds where this user has tasks assigned to them
        const tasksWithUser = await Task.distinct('groupId', {
            $or: [
                { assigneeIds: userId },
                { createdBy: userId }
            ]
        });

        // Build OR filter: created by user OR user is in userIds OR has task in group
        const accessibleGroupIds = tasksWithUser.filter(Boolean);

        groups = await TaskGroup.find({
            $or: [
                { createdBy: userId },
                { userIds: userId },
                { _id: { $in: accessibleGroupIds } }
            ]
        }).populate('userIds', 'name email').sort({ name: 1 });
    }

    res.send(new ApiResponse(httpStatus.OK, groups, 'Groups fetched successfully'));
});

// Get Single Group with child tasks
const getGroup = asyncHandler(async (req, res) => {
    const group = await TaskGroup.findById(req.params.groupId).populate('userIds', 'name email');
    if (!group) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');
    }

    const tasks = await Task.find({ groupId: group._id }).sort({ dueDate: 1 });

    // Calculate progress
    const total = tasks.length;
    const closed = tasks.filter(t => t.status === 'COMPLETED').length;

    res.send(new ApiResponse(httpStatus.OK, { group, tasks, progress: { total, closed } }, 'Group details fetched successfully'));
});

// Update a group
const updateGroup = asyncHandler(async (req, res) => {
    const group = await TaskGroup.findById(req.params.groupId);
    if (!group) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');
    }

    if (req.body.userIds) {
        let finalUserIds = Array.isArray(req.body.userIds) ? [...req.body.userIds] : [];
        // Make sure creator is not explicitly removed if we still want them to be a part of it, or allow them to remove themselves?
        // Usually better to keep the creator in the group.
        if (group.createdBy && !finalUserIds.includes(group.createdBy.toString())) {
            finalUserIds.push(group.createdBy.toString());
        }
        req.body.userIds = finalUserIds;
    }

    Object.assign(group, req.body);
    await group.save();

    res.send(new ApiResponse(httpStatus.OK, group, 'Group updated successfully'));
});


// ── Get groups accessible to current user (filtered) ────────────────────
const getMyGroups = asyncHandler(async (req, res) => {
    let groups;
    const userId = req.user._id;

    if (req.user.role === 'admin') {
        groups = await TaskGroup.find({}).select('_id name').sort({ name: 1 });
    } else {
        // Condition 3: groups where user has tasks (assigned or created)
        const groupIdsFromTasks = await Task.distinct('groupId', {
            $or: [
                { assigneeIds: userId },
                { createdBy: userId }
            ]
        });

        groups = await TaskGroup.find({
            $or: [
                { createdBy: userId },
                { userIds: userId },
                { _id: { $in: groupIdsFromTasks.filter(Boolean) } }
            ]
        }).select('_id name').sort({ name: 1 });
    }

    res.send(new ApiResponse(httpStatus.OK, groups, 'My groups fetched'));
});

export default {
    createGroup,
    getGroups,
    getMyGroups,
    getGroup,
    updateGroup,
    deleteGroup,
};
