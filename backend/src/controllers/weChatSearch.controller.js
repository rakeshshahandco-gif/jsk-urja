import httpStatus from 'http-status';
import { WeChatContact } from '../models/weChatContact.model.js';
import { WeChatGroup } from '../models/weChatGroup.model.js';
import { WeChatProduct } from '../models/weChatProduct.model.js';
import { WeChatPriceRecord } from '../models/weChatPriceRecord.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const globalSearch = asyncHandler(async (req, res) => {
    const { q } = req.query;
    if (!q) {
        return res.send(new ApiResponse(httpStatus.OK, { products: [], contacts: [], groups: [], prices: [] }));
    }

    const searchRegex = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

    // Parallel search across collections
    let [products, contacts, initialGroups, prices] = await Promise.all([
        WeChatProduct.find({
            $or: [
                { productName: searchRegex },
                { productCode: searchRegex },
                { chineseProductName: searchRegex },
                { category: searchRegex },
                { partNumber: searchRegex },
                { altPartNumbers: searchRegex },
                { brandName: searchRegex },
                { modelNo: searchRegex },
                { description: searchRegex },
                { inventoryItemCode: searchRegex },
                { inventoryItemName: searchRegex }
            ]
        }).limit(20).populate('wechatGroupIds', 'groupName groupAlias chineseGroupName'),

        WeChatContact.find({
            $or: [
                { weChatDisplayName: searchRegex },
                { englishName: searchRegex },
                { chineseName: searchRegex },
                { companyName: searchRegex },
                { weChatId: searchRegex },
                { mobile: searchRegex },
                { email: searchRegex }
            ]
        }).limit(20),

        WeChatGroup.find({
            $or: [
                { groupName: searchRegex },
                { groupAlias: searchRegex },
                { chineseGroupName: searchRegex },
                { purpose: searchRegex },
                { groupCreatedBy: searchRegex },
                { productKeywords: searchRegex }
            ]
        }).limit(20).populate('productIds', 'productName partNumber category'),

        WeChatPriceRecord.find({
            $or: [
                { productName: searchRegex },
                { partNumber: searchRegex },
                { productCategory: searchRegex },
                { brandName: searchRegex },
                { modelNo: searchRegex },
                { technicalRemarks: searchRegex },
                { remarks: searchRegex }
            ]
        })
        .populate('productId')
        .populate('contactId')
        .populate('groupId')
        .sort('-quotationDate')
        .limit(50)
    ]);

    // INTELLIGENCE LINKING: If products were found, find all groups they belong to
    // and merge them into the groups result
    let groups = [...initialGroups];
    if (products.length > 0) {
        const productIds = products.map(p => p._id);
        const autoLinkedGroups = await WeChatGroup.find({
            productIds: { $in: productIds },
            _id: { $nin: initialGroups.map(g => g._id) } // Avoid duplicates
        }).limit(10).populate('productIds', 'productName partNumber category');
        
        groups = [...groups, ...autoLinkedGroups];
    }

    // For products, also fetch ALL related prices even if they don't match the search term
    // (Requested: "When I search product... show product-wise rates from each group")
    if (products.length > 0) {
        const productIds = products.map(p => p._id);
        const relatedPrices = await WeChatPriceRecord.find({ productId: { $in: productIds } })
            .populate('contactId')
            .populate('groupId')
            .sort('-quotationDate');
        
        products = products.map(p => {
            const doc = p.toObject();
            doc.rates = relatedPrices.filter(r => r.productId._id.toString() === p._id.toString());
            return doc;
        });
    }

    // For groups, also fetch their rates and members
    if (groups.length > 0) {
        const groupIds = groups.map(g => g._id);
        const [groupPrices, groupMembers] = await Promise.all([
            WeChatPriceRecord.find({ groupId: { $in: groupIds } }).populate('productId').populate('contactId'),
            WeChatContact.find({ groupIds: { $in: groupIds } }) // Assuming contacts have groupIds array or use the join table
        ]);
        
        // Actually, better to use the join table for members
        const { WeChatGroupMember } = await import('../models/weChatGroupMember.model.js');
        const membersJoin = await WeChatGroupMember.find({ groupId: { $in: groupIds } }).populate('contactId');

        groups = groups.map(g => {
            const doc = g.toObject();
            doc.rates = groupPrices.filter(r => r.groupId?._id.toString() === g._id.toString());
            doc.members = membersJoin.filter(m => m.groupId.toString() === g._id.toString()).map(m => m.contactId);
            return doc;
        });
    }

    res.send(new ApiResponse(httpStatus.OK, {
        products,
        contacts,
        groups,
        prices
    }));
});
