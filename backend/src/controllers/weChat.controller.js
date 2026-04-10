import httpStatus from 'http-status';
import { WeChatContact } from '../models/weChatContact.model.js';
import { WeChatGroup } from '../models/weChatGroup.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import pick from '../utils/pick.js';

const generateWeChatNo = async () => {
    const lastContact = await WeChatContact.findOne().sort({ createdAt: -1 });
    let nextNum = 1;
    if (lastContact && lastContact.entryNo) {
        const match = lastContact.entryNo.match(/WCC-(\d+)/);
        if (match) {
            nextNum = parseInt(match[1]) + 1;
        }
    }
    return `WCC-${String(nextNum).padStart(4, '0')}`;
};

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

// ── Unified Search ───────────────────────────────────────────────────────────

export const searchUnified = asyncHandler(async (req, res) => {
    const { search } = req.query;
    if (!search) {
        return res.send(new ApiResponse(httpStatus.OK, { contacts: [], groups: [] }));
    }

    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = { $regex: escapedSearch, $options: 'i' };
    
    // 1. Search Contacts
    const contactsQuery = {
        $or: [
            { weChatDisplayName: searchRegex },
            { englishName: searchRegex },
            { chineseName: searchRegex },
            { searchName: searchRegex },
            { searchKeywords: searchRegex },
            { companyName: searchRegex },
            { contactPersonName: searchRegex },
            { productKeywords: searchRegex },
            { relatedItems: searchRegex },
            { shortCode: searchRegex }
        ],
        isActive: true
    };

    // 2. Search Groups
    const groupsQuery = {
        $or: [
            { groupName: searchRegex },
            { groupAlias: searchRegex },
            { chineseGroupName: searchRegex },
            { productKeywords: searchRegex },
            { relatedItems: searchRegex },
            { relatedCompanies: searchRegex },
            { purpose: searchRegex }
        ],
        isActive: true
    };

    const [contacts, groups] = await Promise.all([
        WeChatContact.find(contactsQuery).limit(20).lean(),
        WeChatGroup.find(groupsQuery).limit(20).lean()
    ]);

    // Tag results for unified display if needed, but keeping separate in response for UI flexibility
    res.send(new ApiResponse(httpStatus.OK, { contacts, groups }));
});

// ── Contact Controllers ──────────────────────────────────────────────────────

export const createContact = asyncHandler(async (req, res) => {
    if (!req.body.entryNo) {
        req.body.entryNo = await generateWeChatNo();
    }
    const contact = await WeChatContact.create({
        ...req.body,
        createdBy: req.user._id
    });
    
    // Link to groups if provided
    if (req.body.groupIds?.length > 0) {
        await WeChatGroup.updateMany(
            { _id: { $in: req.body.groupIds } },
            { $addToSet: { memberIds: contact._id } }
        );
    }

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, contact, 'WeChat contact created successfully'));
});

export const getContacts = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['contactType', 'isActive', 'isFavorite', 'supplierType']);
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
            { productKeywords: searchRegex },
            { searchKeywords: searchRegex }
        ];
    }

    const contacts = await WeChatContact.find(query)
        .sort(options.sortBy || '-createdAt')
        .populate('groupIds', 'groupName groupAlias');

    res.send(new ApiResponse(httpStatus.OK, contacts));
});

export const getContact = asyncHandler(async (req, res) => {
    const contact = await WeChatContact.findById(req.params.contactId)
        .populate('notesHistory.user', 'name')
        .populate('groupIds', 'groupName groupAlias chineseGroupName');
    
    if (!contact) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Contact not found');
    }
    res.send(new ApiResponse(httpStatus.OK, contact));
});

export const updateContact = asyncHandler(async (req, res) => {
    const oldContact = await WeChatContact.findById(req.params.contactId);
    const contact = await WeChatContact.findByIdAndUpdate(req.params.contactId, req.body, { new: true });
    
    if (!contact) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Contact not found');
    }

    // Update Group memberships if groupIds changed
    if (req.body.groupIds) {
        // Remove from old groups
        await WeChatGroup.updateMany(
            { _id: { $in: oldContact.groupIds } },
            { $pull: { memberIds: contact._id } }
        );
        // Add to new groups
        await WeChatGroup.updateMany(
            { _id: { $in: req.body.groupIds } },
            { $addToSet: { memberIds: contact._id } }
        );
    }

    res.send(new ApiResponse(httpStatus.OK, contact, 'Contact updated successfully'));
});

// ── Group Controllers ────────────────────────────────────────────────────────

export const createGroup = asyncHandler(async (req, res) => {
    if (!req.body.entryNo) {
        req.body.entryNo = await generateGroupNo();
    }
    const group = await WeChatGroup.create({
        ...req.body,
        createdBy: req.user._id
    });
    
    // Link members if provided
    if (req.body.memberIds?.length > 0) {
        await WeChatContact.updateMany(
            { _id: { $in: req.body.memberIds } },
            { $addToSet: { groupIds: group._id } }
        );
    }

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, group, 'WeChat group created successfully'));
});

export const getGroups = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['isActive', 'isFavorite', 'category']);
    const options = pick(req.query, ['search']);
    
    let query = { ...filter };
    if (options.search) {
        const escapedSearch = options.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchRegex = { $regex: escapedSearch, $options: 'i' };
        query.$or = [
            { groupName: searchRegex },
            { groupAlias: searchRegex },
            { chineseGroupName: searchRegex },
            { productKeywords: searchRegex }
        ];
    }

    const groups = await WeChatGroup.find(query).sort('-createdAt');
    res.send(new ApiResponse(httpStatus.OK, groups));
});

export const getGroup = asyncHandler(async (req, res) => {
    const group = await WeChatGroup.findById(req.params.groupId)
        .populate('memberIds', 'weChatDisplayName englishName chineseName companyName')
        .populate('notesHistory.user', 'name');
        
    if (!group) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');
    }
    res.send(new ApiResponse(httpStatus.OK, group));
});

export const updateGroup = asyncHandler(async (req, res) => {
    const oldGroup = await WeChatGroup.findById(req.params.groupId);
    const group = await WeChatGroup.findByIdAndUpdate(req.params.groupId, req.body, { new: true });
    
    if (!group) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');
    }

    // Update member's group links if memberIds changed
    if (req.body.memberIds) {
        // Remove group from old members
        await WeChatContact.updateMany(
            { _id: { $in: oldGroup.memberIds } },
            { $pull: { groupIds: group._id } }
        );
        // Add group to new members
        await WeChatContact.updateMany(
            { _id: { $in: req.body.memberIds } },
            { $addToSet: { groupIds: group._id } }
        );
    }

    res.send(new ApiResponse(httpStatus.OK, group, 'Group updated successfully'));
});

// ── Shared Controllers (Notes & Attachments) ─────────────────────────────────

export const addNoteToContact = asyncHandler(async (req, res) => {
    const contact = await WeChatContact.findById(req.params.contactId);
    if (!contact) throw new ApiError(httpStatus.NOT_FOUND, 'Contact not found');
    
    contact.notesHistory.push({ ...req.body, user: req.user._id, date: new Date() });
    await contact.save();
    res.send(new ApiResponse(httpStatus.OK, contact, 'Note added'));
});

export const addNoteToGroup = asyncHandler(async (req, res) => {
    const group = await WeChatGroup.findById(req.params.groupId);
    if (!group) throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');
    
    group.notesHistory.push({ ...req.body, user: req.user._id, date: new Date() });
    await group.save();
    res.send(new ApiResponse(httpStatus.OK, group, 'Note added'));
});

export const uploadAttachment = asyncHandler(async (req, res) => {
    const { targetType, targetId } = req.params; // targetType: 'contact' or 'group'
    const { type, notes } = req.body;
    
    if (!req.file) throw new ApiError(httpStatus.BAD_REQUEST, 'No file uploaded');

    const attachment = {
        filename: req.file.originalname,
        url: `/uploads/prd/${req.file.filename}`, // Using existing prd path for now
        mimetype: req.file.mimetype,
        size: req.file.size,
        type: type || 'Other',
        notes,
        uploadDate: new Date()
    };

    if (targetType === 'contact') {
        const contact = await WeChatContact.findByIdAndUpdate(
            targetId,
            { $push: { attachments: attachment } },
            { new: true }
        );
        res.send(new ApiResponse(httpStatus.OK, contact, 'Attachment uploaded to contact'));
    } else {
        const group = await WeChatGroup.findByIdAndUpdate(
            targetId,
            { $push: { attachments: { ...attachment, uploadedBy: req.user._id } } },
            { new: true }
        );
        res.send(new ApiResponse(httpStatus.OK, group, 'Attachment uploaded to group'));
    }
});

export const deleteContact = asyncHandler(async (req, res) => {
    await WeChatContact.findByIdAndDelete(req.params.contactId);
    res.send(new ApiResponse(httpStatus.OK, null, 'Contact deleted'));
});

export const deleteGroup = asyncHandler(async (req, res) => {
    await WeChatGroup.findByIdAndDelete(req.params.groupId);
    res.send(new ApiResponse(httpStatus.OK, null, 'Group deleted'));
});
