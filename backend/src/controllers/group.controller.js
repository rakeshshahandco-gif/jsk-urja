import httpStatus from 'http-status';
import pick from '../utils/pick.js';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js'; // Checking if it's asyncHandler or catchAsync
import { Group } from '../models/group.model.js';
import { GroupMember } from '../models/groupMember.model.js';
import { User } from '../models/user.model.js';

// Helper to check if file uses asyncHandler or catchAsync
// Based on auth.middleware.js, it imports asyncHandler from ../utils/asyncHandler.js
// So I will use asyncHandler
import { asyncHandler } from '../utils/asyncHandler.js';

const createGroup = asyncHandler(async (req, res) => {
    const { name, code, description, members } = req.body;

    // Check if group name exists
    if (await Group.findOne({ name })) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Group name already taken');
    }

    const group = await Group.create({
        name,
        code,
        description,
        createdBy: req.user.id
    });

    // Add initial members if provided
    if (members && members.length > 0) {
        const memberDocs = members.map(m => ({
            group: group._id,
            user: m.userId,
            role: m.role || 'MEMBER',
            addedBy: req.user.id
        }));
        await GroupMember.insertMany(memberDocs);
    } else {
        // Optionally add creator as owner? 
        // Requirements say "Admin can create groups", "Admin can add/remove members".
        // Let's NOT auto-add unless specified, to keep it clean.
    }

    res.status(httpStatus.CREATED).send(group);
});

const getGroups = asyncHandler(async (req, res) => {
    // Admin sees all, User sees belonging (Changed to all users see all)
    const filter = pick(req.query, ['name', 'role']);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    // Fetch all groups matching filter for everyone
    const groups = await Group.find(filter); // Todo: add pagination if needed
    res.send(groups);
});

const getGroup = asyncHandler(async (req, res) => {
    const group = await Group.findById(req.params.groupId).populate('createdBy', 'name email');
    if (!group) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');
    }

    // Access check removed - all users can view group details

    // Get members
    const members = await GroupMember.find({ group: group._id }).populate('user', 'name email role');

    res.send({ group, members });
});

const updateGroup = asyncHandler(async (req, res) => {
    const group = await Group.findByIdAndUpdate(req.params.groupId, req.body, { new: true });
    if (!group) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');
    }
    res.send(group);
});

const deleteGroup = asyncHandler(async (req, res) => {
    // Soft delete or hard delete? Requirements: "admin only or soft delete is_active=false"
    // I'll implement soft delete as per common practice and requirements hint
    const group = await Group.findByIdAndUpdate(req.params.groupId, { isActive: false }, { new: true });
    if (!group) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');
    }
    res.send(group); // or 204
});

const addMember = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { userId, role } = req.body;

    const group = await Group.findById(groupId);
    if (!group) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    const existingMember = await GroupMember.findOne({ group: groupId, user: userId });
    if (existingMember) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'User is already a member of this group');
    }

    const member = await GroupMember.create({
        group: groupId,
        user: userId,
        role,
        addedBy: req.user.id
    });

    res.status(httpStatus.CREATED).send(member);
});

const removeMember = asyncHandler(async (req, res) => {
    const { groupId, userId } = req.params;

    const member = await GroupMember.findOneAndDelete({ group: groupId, user: userId });
    if (!member) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Member not found in this group');
    }

    res.status(httpStatus.NO_CONTENT).send();
});

const getAssignableGroups = asyncHandler(async (req, res) => {
    const query = { isActive: true };

    // Return all active groups for all users
    const groups = await Group.find(query).select('name isActive').sort({ name: 1 });

    if (process.env.NODE_ENV === 'development') {
        console.log(`[getAssignableGroups] User ${req.user.id} fetched ${groups.length} active groups.`);
    }

    res.status(200).json({
        success: true,
        data: groups.map(g => ({
            id: g._id,
            name: g.name,
            isActive: g.isActive
        }))
    });
});

export {
    createGroup,
    getGroups,
    getGroup,
    updateGroup,
    deleteGroup,
    addMember,
    removeMember,
    getAssignableGroups
};

