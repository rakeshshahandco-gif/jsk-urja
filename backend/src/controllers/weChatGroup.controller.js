import httpStatus from 'http-status';
import { WeChatGroup } from '../models/weChatGroup.model.js';
import { WeChatGroupMember } from '../models/weChatGroupMember.model.js';
import { WeChatProduct } from '../models/weChatProduct.model.js';
import { WeChatContact } from '../models/weChatContact.model.js';
import { WeChatPriceRecord } from '../models/weChatPriceRecord.model.js';
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
    await WeChatPriceRecord.deleteMany({ groupId: req.params.groupId });
    res.send(new ApiResponse(httpStatus.OK, null, 'Group and all related records deleted'));
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

// --- Deep Fetch for Editing ---

export const getGroupDeep = asyncHandler(async (req, res) => {
    const group = await WeChatGroup.findById(req.params.groupId);
    if (!group) throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');

    const members = await WeChatGroupMember.find({ groupId: group._id }).populate('contactId');
    const rates = await WeChatPriceRecord.find({ groupId: group._id }).populate('productId').populate('contactId');

    res.send(new ApiResponse(httpStatus.OK, {
        groupDetails: group,
        members: members.map(m => ({
            ...m.contactId?.toObject(),
            role: m.roleInGroup,
            isMainContact: m.isMainDealingPerson,
            remarks: m.remarks,
            membershipId: m._id
        })),
        productRates: rates.map(r => ({
            ...r.toObject(),
            productId: r.productId?._id,
            productName: r.productName,
            partNumber: r.partNumber,
            quotedByMember: r.contactId?.weChatDisplayName || '',
            rateRMB: r.price,
            sampleRateRMB: r.samplePrice,
            bulkRateRMB: r.bulkPrice,
            leadTime: r.leadTimeDays,
            quotationDate: r.quotationDate ? r.quotationDate.toISOString().split('T')[0] : ''
        }))
    }));
});

// --- Bulk Save / Deep Create Group ---

export const createGroupDeep = asyncHandler(async (req, res) => {
    const { groupDetails, productRates, members } = req.body;

    // 1. Save Group
    if (!groupDetails.entryNo) {
        groupDetails.entryNo = await generateGroupNo();
    }
    
    let group;
    if (groupDetails._id) {
        group = await WeChatGroup.findByIdAndUpdate(groupDetails._id, groupDetails, { new: true });
        // Clear existing related records for this group to ensure clean update
        await WeChatGroupMember.deleteMany({ groupId: group._id });
        await WeChatPriceRecord.deleteMany({ groupId: group._id });
    } else {
        group = await WeChatGroup.create({
            ...groupDetails,
            createdBy: req.user._id
        });
    }

    // 2. Process Members (Sync to Contact Master)
    const memberIdMap = {}; // Map temp ID or WeChat ID to MongoDB ID
    
    for (const member of (members || [])) {
        let contact;
        // Search by WeChat ID if available, or try to find existing by Mobile
        if (member.weChatId) {
            contact = await WeChatContact.findOne({ weChatId: member.weChatId });
        } else if (member.mobile) {
            contact = await WeChatContact.findOne({ mobile: member.mobile });
        }

        if (contact) {
            // Update existing contact with any new info
            contact = await WeChatContact.findByIdAndUpdate(contact._id, member, { new: true });
        } else {
            // Create new contact
            const lastContact = await WeChatContact.findOne().sort({ createdAt: -1 });
            let nextNum = 1;
            if (lastContact && lastContact.entryNo) {
                const match = lastContact.entryNo.match(/WCC-(\d+)/);
                if (match) nextNum = parseInt(match[1]) + 1;
            }
            const entryNo = `WCC-${String(nextNum).padStart(4, '0')}`;
            
            contact = await WeChatContact.create({
                ...member,
                entryNo,
                createdBy: req.user._id
            });
        }

        memberIdMap[member.tempId || member.weChatId || member.weChatDisplayName] = contact._id;

        // Ensure member is linked to group
        const existingMembership = await WeChatGroupMember.findOne({ groupId: group._id, contactId: contact._id });
        if (!existingMembership) {
            await WeChatGroupMember.create({
                groupId: group._id,
                contactId: contact._id,
                roleInGroup: member.role || 'Unknown',
                isMainDealingPerson: member.isMainContact || false,
                remarks: member.remarks,
                addedBy: req.user._id
            });
        }
    }

    // 3. Process Products & Price Records
    for (const rate of (productRates || [])) {
        let product;
        if (rate.productId) {
            product = await WeChatProduct.findById(rate.productId);
        } else {
            // Try to find by partNumber
            product = await WeChatProduct.findOne({ partNumber: rate.partNumber });
        }

        if (!product) {
            // Create new product
            product = await WeChatProduct.create({
                productName: rate.productName,
                chineseProductName: rate.chineseProductName,
                category: rate.productCategory,
                brandName: rate.brandName,
                modelNo: rate.modelNo,
                specification: rate.specification,
                partNumber: rate.partNumber,
                createdBy: req.user._id
            });
        } else {
            // Update product details if provided
            await WeChatProduct.findByIdAndUpdate(product._id, {
                chineseProductName: rate.chineseProductName || product.chineseProductName,
                category: rate.productCategory || product.category,
                brandName: rate.brandName || product.brandName,
                modelNo: rate.modelNo || product.modelNo,
                specification: rate.specification || product.specification
            });
        }

        // Create Price Record (Quotation)
        const contactId = memberIdMap[rate.quotedByMember] || memberIdMap[rate.contactId];
        
        if (contactId) {
            await WeChatPriceRecord.create({
                productId: product._id,
                groupId: group._id,
                contactId: contactId,
                partNumber: product.partNumber,
                productCategory: product.category,
                productName: product.productName,
                brandName: product.brandName,
                modelNo: product.modelNo,
                price: rate.rateRMB || 0,
                currency: rate.currency || 'RMB',
                moq: rate.moq || 0,
                samplePrice: rate.sampleRateRMB || 0,
                bulkPrice: rate.bulkRateRMB || 0,
                leadTimeDays: rate.leadTime || 0,
                remarks: rate.remarks,
                quotationDate: rate.quotationDate || new Date(),
                source: 'group_chat',
                recordedBy: req.user._id
            });
        }
    }

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, group, 'Group saved successfully with products and members synced'));
});
