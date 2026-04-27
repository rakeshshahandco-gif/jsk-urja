import httpStatus from 'http-status';
import { WeChatContact } from '../models/weChatContact.model.js';
import { WeChatGroup } from '../models/weChatGroup.model.js';
import { WeChatGroupMember } from '../models/weChatGroupMember.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import pick from '../utils/pick.js';

const generateWeChatNo = async () => {
    const lastContact = await WeChatContact.findOne().sort({ createdAt: -1 });
    let nextNum = 1;
    if (lastContact && lastContact.entryNo) {
        // Robust regex to find the last sequence of digits, handling "DEMO" or other prefixes
        const match = lastContact.entryNo.match(/(\d+)$/);
        if (match) {
            nextNum = parseInt(match[1]) + 1;
        }
    }
    return `WCC-${String(nextNum).padStart(4, '0')}`;
};

export const createContact = asyncHandler(async (req, res) => {
    if (!req.body.entryNo) {
        req.body.entryNo = await generateWeChatNo();
    }
    const contact = await WeChatContact.create({
        ...req.body,
        createdBy: req.user._id
    });
    
    // Legacy support for groupIds passed during creation
    if (req.body.groupIds?.length > 0) {
        const memberships = req.body.groupIds.map(groupId => ({
            contactId: contact._id,
            groupId,
            addedBy: req.user._id
        }));
        await WeChatGroupMember.insertMany(memberships);
    }

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, contact, 'WeChat contact created successfully'));
});

export const getContacts = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['contactType', 'isActive', 'isFavorite', 'role', 'language']);
    const options = pick(req.query, ['sortBy', 'limit', 'page', 'search']);
    
    let query = { ...filter };
    
    if (options.search) {
        const escapedSearch = options.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchRegex = { $regex: escapedSearch, $options: 'i' };
        query.$or = [
            { weChatDisplayName: searchRegex },
            { englishName: searchRegex },
            { chineseName: searchRegex },
            { companyName: searchRegex },
            { weChatId: searchRegex },
            { mobile: searchRegex }
        ];
    }

    const contacts = await WeChatContact.find(query).sort(options.sortBy || '-createdAt');

    // Manually populate groups via the join table for the list view
    const contactIds = contacts.map(c => c._id);
    const memberships = await WeChatGroupMember.find({ contactId: { $in: contactIds } })
        .populate('groupId', 'groupName groupAlias');

    const result = contacts.map(contact => {
        const contactDoc = contact.toObject();
        contactDoc.groups = memberships
            .filter(m => m.contactId.toString() === contact._id.toString())
            .map(m => m.groupId);
        return contactDoc;
    });

    res.send(new ApiResponse(httpStatus.OK, result));
});

export const getContact = asyncHandler(async (req, res) => {
    const contact = await WeChatContact.findById(req.params.contactId)
        .populate('notesHistory.user', 'name');
    
    if (!contact) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Contact not found');
    }

    const memberships = await WeChatGroupMember.find({ contactId: contact._id })
        .populate('groupId');

    const result = contact.toObject();
    result.groupMemberships = memberships;

    res.send(new ApiResponse(httpStatus.OK, result));
});

export const updateContact = asyncHandler(async (req, res) => {
    const contact = await WeChatContact.findByIdAndUpdate(req.params.contactId, req.body, { new: true });
    
    if (!contact) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Contact not found');
    }

    res.send(new ApiResponse(httpStatus.OK, contact, 'Contact updated successfully'));
});

export const deleteContact = asyncHandler(async (req, res) => {
    await WeChatContact.findByIdAndDelete(req.params.contactId);
    await WeChatGroupMember.deleteMany({ contactId: req.params.contactId });
    res.send(new ApiResponse(httpStatus.OK, null, 'Contact deleted'));
});
