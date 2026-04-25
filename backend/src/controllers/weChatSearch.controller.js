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

    const searchRegex = { $regex: q, $options: 'i' };

    // Parallel search across collections
    const [products, contacts, groups, prices] = await Promise.all([
        WeChatProduct.find({
            $or: [
                { productName: searchRegex },
                { productCode: searchRegex },
                { chineseProductName: searchRegex },
                { category: searchRegex },
                { partNumber: searchRegex },
                { description: searchRegex }
            ]
        }).limit(10),

        WeChatContact.find({
            $or: [
                { weChatDisplayName: searchRegex },
                { englishName: searchRegex },
                { chineseName: searchRegex },
                { companyName: searchRegex },
                { weChatId: searchRegex },
                { mobile: searchRegex }
            ]
        }).limit(10),

        WeChatGroup.find({
            $or: [
                { groupName: searchRegex },
                { groupAlias: searchRegex },
                { chineseGroupName: searchRegex },
                { purpose: searchRegex }
            ]
        }).limit(10),

        WeChatPriceRecord.find({
            $or: [
                { productName: searchRegex },
                { partNumber: searchRegex },
                { productCategory: searchRegex },
                { technicalRemarks: searchRegex }
            ]
        }).populate('productId').populate('contactId').limit(10)
    ]);

    res.send(new ApiResponse(httpStatus.OK, {
        products,
        contacts,
        groups,
        prices
    }));
});
