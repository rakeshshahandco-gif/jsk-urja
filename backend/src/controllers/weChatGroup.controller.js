import httpStatus from 'http-status';
import { WeChatGroup } from '../models/weChatGroup.model.js';
import { WeChatGroupMember } from '../models/weChatGroupMember.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import pick from '../utils/pick.js';

const generateGroupNo = async () => {
    const lastGroup = await WeChatGroup.findOne().sort({ createdAt: -1 });
    let nextNum = 1;
    if (lastGroup && lastGroup.entryNo) {
        const match = lastGroup.entryNo.match(/WCG-(\d+)/);
        if (match) {
            nextNum = parseInt(match[1]) + 1;
        }
    }
    return `WCG-${String(nextNum).padStart(4, '0')}`;
};

export const createGroup = asyncHandler(async (req, res) => {
    if (!req.body.entryNo) {
        req.body.entryNo = await generateGroupNo();
    }
    const group = await WeChatGroup.create({
        ...req.body,
        createdBy: req.user._id
    });
    
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, group, 'WeChat group created successfully'));
});

export const getGroups = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['isActive', 'category', 'groupSource']);
    const options = pick(req.query, ['search']);
    
    let query = { ...filter };
    if (options.search) {
        const escapedSearch = options.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchRegex = { $regex: escapedSearch, $options: 'i' };
        query.$or = [
            { groupName: searchRegex },
            { groupAlias: searchRegex },
            { chineseGroupName: searchRegex },
            { purpose: searchRegex }
        ];
    }

    const groups = await WeChatGroup.find(query).sort('-createdAt');
    res.send(new ApiResponse(httpStatus.OK, groups));
});

export const getGroup = asyncHandler(async (req, res) => {
    const group = await WeChatGroup.findById(req.params.groupId)
        .populate('notesHistory.user', 'name');
        
    if (!group) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');
    }

    const members = await WeChatGroupMember.find({ groupId: group._id })
        .populate('contactId', 'weChatDisplayName englishName chineseName companyName weChatId mobile role');

    const result = group.toObject();
    result.members = members;

    res.send(new ApiResponse(httpStatus.OK, result));
});

export const updateGroup = asyncHandler(async (req, res) => {
    const group = await WeChatGroup.findByIdAndUpdate(req.params.groupId, req.body, { new: true });
    
    if (!group) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');
    }

    res.send(new ApiResponse(httpStatus.OK, group, 'Group updated successfully'));
});

export const deleteGroup = asyncHandler(async (req, res) => {
    await WeChatGroup.findByIdAndDelete(req.params.groupId);
    await WeChatGroupMember.deleteMany({ groupId: req.params.groupId });
    res.send(new ApiResponse(httpStatus.OK, null, 'Group deleted'));
});

// --- Group Members API ---

export const addGroupMember = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { contactId, roleInGroup, isMainDealingPerson, remarks } = req.body;

    const existing = await WeChatGroupMember.findOne({ groupId, contactId });
    if (existing) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Contact is already a member of this group');
    }

    const membership = await WeChatGroupMember.create({
        groupId,
        contactId,
        roleInGroup,
        isMainDealingPerson,
        remarks,
        addedBy: req.user._id
    });

    const populated = await WeChatGroupMember.findById(membership._id)
        .populate('contactId', 'weChatDisplayName englishName chineseName companyName weChatId mobile role');

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, populated, 'Member added to group'));
});

export const updateGroupMember = asyncHandler(async (req, res) => {
    const { membershipId } = req.params;
    const membership = await WeChatGroupMember.findByIdAndUpdate(membershipId, req.body, { new: true })
        .populate('contactId', 'weChatDisplayName englishName chineseName companyName weChatId mobile role');
        
    if (!membership) throw new ApiError(httpStatus.NOT_FOUND, 'Membership not found');
    res.send(new ApiResponse(httpStatus.OK, membership, 'Group member updated'));
});

export const removeGroupMember = asyncHandler(async (req, res) => {
    const { membershipId } = req.params;
    await WeChatGroupMember.findByIdAndDelete(membershipId);
    res.send(new ApiResponse(httpStatus.OK, null, 'Group member removed'));
});
