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
    // Sort by entryNo descending to find the highest number in the sequence
    const lastGroup = await WeChatGroup.findOne({ entryNo: /^WCG-/ }).sort({ entryNo: -1 });
    let nextNum = 1;
    if (lastGroup && lastGroup.entryNo) {
        const match = lastGroup.entryNo.match(/(\d+)$/);
        if (match) {
            nextNum = parseInt(match[1]) + 1;
        }
    }
    return `WCG-${String(nextNum).padStart(4, '0')}`;
};

export const createGroup = asyncHandler(async (req, res) => {
    const existingGroup = await WeChatGroup.findOne({ groupName: req.body.groupName });
    if (existingGroup) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Group with this name already exists');
    }

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
            { purpose: searchRegex },
            { productKeywords: searchRegex }
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
    const group = await WeChatGroup.findById(req.params.groupId).populate('productIds');
    if (!group) throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');

    const members = await WeChatGroupMember.find({ groupId: group._id }).populate('contactId');
    const rates = await WeChatPriceRecord.find({ groupId: group._id }).populate('productId').populate('contactId');

    // 1. Map existing price records
    const productRates = rates.map(r => ({
        ...r.toObject(),
        id: r._id,
        productId: r.productId?._id,
        productName: r.productName || r.productId?.productName || '',
        partNumber: r.partNumber || r.productId?.partNumber || '',
        productCategory: r.productCategory || r.productId?.category || '',
        brandName: r.brandName || r.productId?.brandName || '',
        modelNo: r.modelNo || r.productId?.modelNo || '',
        specification: r.technicalRemarks || r.productId?.specification || '',
        quotedByMember: r.contactId?.weChatDisplayName || '',
        rateRMB: r.price,
        sampleRateRMB: r.samplePrice,
        bulkRateRMB: r.bulkPrice,
        exchangeRate: r.exchangeRate || 1,
        freightPercent: r.freightPercent || 0,
        freightPerUnit: r.freightPerUnit || 0,
        landingCost: r.landingCost || 0,
        moq: r.moq || 0,
        leadTime: r.leadTimeDays || 0,
        quotationDate: r.quotationDate ? r.quotationDate.toISOString().split('T')[0] : '',

        // Inventory Links
        sourceType: r.sourceType || 'manual',
        inventoryItemId: r.inventoryItemId,
        inventoryItemCode: r.inventoryItemCode,
        inventoryItemName: r.inventoryItemName,
        inventoryItemGroupName: r.inventoryItemGroup,
        inventoryItemGroupId: r.inventoryItemGroupId,
        hsnCode: r.hsnCode,
        uom: r.uom
    }));

    // 2. Add placeholder rows for products linked to group but having no price records yet
    const priceRecordProductIds = rates.map(r => r.productId?._id?.toString());
    const missingProducts = group.productIds.filter(p => !priceRecordProductIds.includes(p._id.toString()));

    missingProducts.forEach(p => {
        productRates.push({
            id: `temp_${p._id}`,
            productId: p._id,
            productName: p.productName,
            partNumber: p.partNumber,
            productCategory: p.category,
            brandName: p.brandName,
            modelNo: p.modelNo,
            specification: p.specification,
            currency: 'RMB',
            exchangeRate: 1,
            freightPercent: 0,
            landingCost: 0,
            sourceType: p.sourceType || 'manual',
            inventoryItemId: p.inventoryItemId,
            inventoryItemCode: p.inventoryItemCode,
            inventoryItemName: p.inventoryItemName,
            inventoryItemGroupName: p.inventoryItemGroup,
            inventoryItemGroupId: p.inventoryItemGroupId,
            quotationDate: new Date().toISOString().split('T')[0]
        });
    });

    // 3. Map members
    const mappedMembers = members.map(m => {
        const c = m.contactId || {};
        return {
            id: m._id,
            _id: m._id,
            contactId: c._id,
            weChatDisplayName: c.weChatDisplayName || '',
            chineseName: c.chineseName || '',
            englishName: c.englishName || '',
            weChatId: c.weChatId || '',
            mobile: c.mobile || '',
            whatsapp: c.whatsapp || '',
            companyName: c.companyName || '',
            role: m.roleInGroup,
            isMainContact: m.isMainDealingPerson,
            remarks: m.remarks,
            membershipId: m._id
        };
    });

    console.log(`[getGroupDeep] Found ${productRates.length} rates and ${mappedMembers.length} members`);

    res.send(new ApiResponse(httpStatus.OK, {
        groupDetails: group,
        members: mappedMembers,
        productRates: productRates
    }));
});

// --- Bulk Save / Deep Create Group ---

export const createGroupDeep = asyncHandler(async (req, res) => {
    const { groupDetails, productRates, members } = req.body;

    // 1. Save Group
    if (!groupDetails._id) {
        const existingGroup = await WeChatGroup.findOne({ groupName: groupDetails.groupName });
        if (existingGroup) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Group with this name already exists');
        }
        
        if (!groupDetails.entryNo) {
            groupDetails.entryNo = await generateGroupNo();
        }
    }
    
    let group;
    if (groupDetails._id) {
        group = await WeChatGroup.findByIdAndUpdate(groupDetails._id, groupDetails, { new: true });
        // Clear existing related records for this group to ensure clean update
        // Note: productIds and productKeywords are part of groupDetails now
        await WeChatGroupMember.deleteMany({ groupId: group._id });
        await WeChatPriceRecord.deleteMany({ groupId: group._id });
    } else {
        group = await WeChatGroup.create({
            ...groupDetails,
            createdBy: req.user._id
        });
    }

    // Bidirectional sync for linked products
    if (group.productIds && group.productIds.length > 0) {
        await WeChatProduct.updateMany(
            { _id: { $in: group.productIds } },
            { $addToSet: { wechatGroupIds: group._id } }
        );
    }

    // 2. Process Members (Sync to Contact Master)
    const memberIdMap = {}; // Map temp ID or WeChat ID to MongoDB ID
    
    for (const member of (members || [])) {
        // Skip empty member rows
        if (!member.weChatDisplayName) continue;

        let contact;
        // Search Criteria: contactId > _id (if valid for contact) > weChatId > mobile
        const searchId = member.contactId || member._id;

        if (searchId && mongoose.Types.ObjectId.isValid(searchId)) {
            contact = await WeChatContact.findById(searchId);
        }

        if (!contact && member.weChatId) {
            contact = await WeChatContact.findOne({ weChatId: member.weChatId });
        } 
        
        if (!contact && member.mobile) {
            contact = await WeChatContact.findOne({ mobile: member.mobile });
        }

        if (contact) {
            // Update existing contact with any new info
            // Strip fields that shouldn't be updated on the contact master itself from the group row
            const { _id, id, contactId, membershipId, role, isMainContact, ...updateData } = member;
            contact = await WeChatContact.findByIdAndUpdate(contact._id, updateData, { new: true });
        } else {
            // Create new contact
            const lastContact = await WeChatContact.findOne().sort({ createdAt: -1 });
            let nextNum = 1;
            if (lastContact && lastContact.entryNo) {
                const match = lastContact.entryNo.match(/(\d+)$/);
                if (match) nextNum = parseInt(match[1]) + 1;
            }
            const entryNo = `WCC-${String(nextNum).padStart(4, '0')}`;
            
            // CRITICAL: Strip _id and contactId to avoid E11000 duplicate key error
            const { _id, id, contactId, membershipId, role, isMainContact, ...newData } = member;
            
            contact = await WeChatContact.create({
                ...newData,
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
                
                // Inventory Links
                sourceType: rate.sourceType || 'manual',
                inventoryItemId: rate.inventoryItemId,
                inventoryItemCode: rate.inventoryItemCode,
                inventoryItemName: rate.inventoryItemName,
                inventoryItemGroup: rate.inventoryItemGroupName,
                inventoryItemGroupId: rate.inventoryItemGroupId,

                createdBy: req.user._id
            });
        } else {
            // Update product details if provided
            const updateData = {
                productName: rate.productName || product.productName,
                partNumber: rate.partNumber || product.partNumber,
                chineseProductName: rate.chineseProductName || product.chineseProductName,
                category: rate.productCategory || product.category,
                brandName: rate.brandName || product.brandName,
                modelNo: rate.modelNo || product.modelNo,
                specification: rate.specification || product.specification
            };

            // Only update inventory fields if explicitly provided
            if (rate.inventoryItemId) {
                updateData.sourceType = 'inventory';
                updateData.inventoryItemId = rate.inventoryItemId;
                updateData.inventoryItemCode = rate.inventoryItemCode;
                updateData.inventoryItemName = rate.inventoryItemName;
                updateData.inventoryItemGroup = rate.inventoryItemGroupName;
                updateData.inventoryItemGroupId = rate.inventoryItemGroupId;
            }

            await WeChatProduct.findByIdAndUpdate(product._id, updateData);
        }

        // Link product to group bi-directionally
        await WeChatProduct.findByIdAndUpdate(product._id, { $addToSet: { wechatGroupIds: group._id } });
        await WeChatGroup.findByIdAndUpdate(group._id, { $addToSet: { productIds: product._id } });

        // Create Price Record (Quotation)
        const contactId = memberIdMap[rate.quotedByMember] || memberIdMap[rate.contactId] || null;

        // Skip rows that are completely empty (no product name, no price, no part number)
        if (!rate.productName && !rate.rateRMB && !rate.partNumber) continue;

        await WeChatPriceRecord.create({
            productId: product._id,
            groupId: group._id,
            contactId: contactId,           // null if no specific member quoted this
            partNumber: rate.partNumber || product.partNumber,
            productCategory: rate.productCategory || product.category,
            productName: rate.productName || product.productName,
            brandName: rate.brandName || product.brandName,
            modelNo: rate.modelNo || product.modelNo,
            price: rate.rateRMB || 0,
            currency: rate.currency || 'RMB',
            moq: rate.moq || 0,
            samplePrice: rate.sampleRateRMB || 0,
            bulkPrice: rate.bulkRateRMB || 0,
            leadTimeDays: rate.leadTime || 0,
            remarks: rate.remarks,
            technicalRemarks: rate.specification,
            uom: rate.uom,
            hsnCode: rate.hsnCode,
            quotationDate: rate.quotationDate || new Date(),
            exchangeRate: parseFloat(rate.exchangeRate) || 1,
            freightPercent: parseFloat(rate.freightPercent) || 0,
            freightPerUnit: (() => {
                const base = (parseFloat(rate.rateRMB) || 0) * (parseFloat(rate.exchangeRate) || 1);
                return Number((base * ((parseFloat(rate.freightPercent) || 0) / 100)).toFixed(5));
            })(),
            landingCost: parseFloat(rate.landingCost) || 0,
            source: 'group_chat',
            recordedBy: req.user._id,

            // Inventory Links for Price Record
            sourceType: rate.sourceType || 'manual',
            inventoryItemId: rate.inventoryItemId,
            inventoryItemCode: rate.inventoryItemCode,
            inventoryItemName: rate.inventoryItemName,
            inventoryItemGroup: rate.inventoryItemGroupName,
            inventoryItemGroupId: rate.inventoryItemGroupId,
            hsnCode: rate.hsnCode,
            uom: rate.uom
        });
    }

    // 4. Automated Linking Logic (Products <-> Contacts <-> Groups)
    // At this point, we have:
    // - group._id
    // - productIds (all products in this group)
    // - contactIds (all contacts who are members of this group)

    const finalProductIds = await WeChatPriceRecord.find({ groupId: group._id }).distinct('productId');
    const groupMembers = await WeChatGroupMember.find({ groupId: group._id });
    const finalContactIds = groupMembers.map(m => m.contactId);

    if (finalProductIds.length > 0 && finalContactIds.length > 0) {
        // A. Link all products to all group members
        await WeChatProduct.updateMany(
            { _id: { $in: finalProductIds } },
            { $addToSet: { wechatContactIds: { $each: finalContactIds }, wechatGroupIds: group._id } }
        );

        // B. Link all group members to all products
        await WeChatContact.updateMany(
            { _id: { $in: finalContactIds } },
            { $addToSet: { productIds: { $each: finalProductIds }, groupIds: group._id } }
        );
    }

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, group, 'Group saved successfully with automated intelligence linking'));
});

// --- Link Existing Intelligence ---
export const linkIntelligence = asyncHandler(async (req, res) => {
    const { 
        productId, 
        productName, 
        groupIds, 
        keyword,
        selectedGroupName,
        itemId,
        itemCode,
        itemName
    } = req.body;

    console.log('--- Intelligence Linking Request ---');
    console.log('Product:', { productId, productName });
    console.log('Keyword:', keyword);
    console.log('Groups:', groupIds);
    console.log('Selected Group Name:', selectedGroupName);
    console.log('Inventory Link:', { itemId, itemCode, itemName });

    if ((!productId && !productName) || !groupIds || !groupIds.length) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Product/Name and Group IDs are required');
    }

    let targetProductId = productId;

    // If no ID, try to find by name or create if absolutely necessary
    if (!targetProductId && productName) {
        let product = await WeChatProduct.findOne({ productName: new RegExp(`^${productName}$`, 'i') });
        if (!product) {
            // Create a minimal product entry to link against
            const lastProd = await WeChatProduct.findOne().sort({ createdAt: -1 });
            let nextNum = 1;
            if (lastProd && lastProd.entryNo) {
                const match = lastProd.entryNo.match(/(\d+)$/);
                if (match) nextNum = parseInt(match[1]) + 1;
            }
            const entryNo = `WCP-${String(nextNum).padStart(4, '0')}`;
            
            product = await WeChatProduct.create({
                productName,
                entryNo,
                createdBy: req.user._id
            });
        }
        targetProductId = product._id;
    }

    // 1. Link Product to Groups & Keywords
    const productUpdate = {
        $addToSet: { 
            wechatGroupIds: { $each: groupIds },
            altPartNumbers: keyword 
        }
    };

    // If we have inventory details, ensure they are synced to the product
    if (itemId) {
        productUpdate.inventoryItemId = itemId;
        productUpdate.inventoryItemCode = itemCode;
        productUpdate.inventoryItemName = itemName;
        productUpdate.sourceType = 'inventory';
    }

    await WeChatProduct.findByIdAndUpdate(targetProductId, productUpdate);

    // 2. Link Groups to Product & Keywords
    await WeChatGroup.updateMany(
        { _id: { $in: groupIds } },
        { 
            $addToSet: { 
                productIds: targetProductId,
                productKeywords: keyword
            } 
        }
    );

    // 3. Link Members of these Groups to the Product
    const groupMembers = await WeChatGroupMember.find({ groupId: { $in: groupIds } });
    const contactIds = groupMembers.map(m => m.contactId).filter(id => id);

    if (contactIds.length > 0) {
        // Link Product to Contacts
        await WeChatProduct.findByIdAndUpdate(targetProductId, {
            $addToSet: { wechatContactIds: { $each: contactIds } }
        });

        // Link Contacts to Product & Groups
        await WeChatContact.updateMany(
            { _id: { $in: contactIds } },
            { $addToSet: { productIds: targetProductId, groupIds: { $each: groupIds } } }
        );
    }

    // 4. Create Draft Price Records for newly linked products in each group
    for (const groupId of groupIds) {
        const existingRecord = await WeChatPriceRecord.findOne({ groupId, productId: targetProductId });
        if (!existingRecord) {
            const product = await WeChatProduct.findById(targetProductId);
            await WeChatPriceRecord.create({
                productId: targetProductId,
                groupId: groupId,
                productName: product.productName,
                partNumber: product.partNumber,
                productCategory: product.category,
                price: 0,
                source: 'manual',
                remarks: 'Auto-linked via intelligence modal'
            });
        }

        // B. Also ensure group members are linked to this product (handled in step 3 above)
        // But if the group has NO members, should we import contacts from the product?
        const memberCount = await WeChatGroupMember.countDocuments({ groupId });
        if (memberCount === 0) {
            const product = await WeChatProduct.findById(targetProductId);
            if (product.wechatContactIds && product.wechatContactIds.length > 0) {
                for (const contactId of product.wechatContactIds) {
                    await WeChatGroupMember.create({
                        groupId,
                        contactId,
                        roleInGroup: 'Unknown',
                        addedBy: req.user._id,
                        remarks: 'Imported from linked product contacts'
                    });
                }
            }
        }
    }

    res.send(new ApiResponse(httpStatus.OK, null, 'Product linked with group successfully and draft records created'));
});
