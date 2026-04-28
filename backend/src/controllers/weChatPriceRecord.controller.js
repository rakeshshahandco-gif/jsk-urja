import httpStatus from 'http-status';
import { WeChatPriceRecord } from '../models/weChatPriceRecord.model.js';
import { WeChatProduct } from '../models/weChatProduct.model.js';
import { WeChatGroup } from '../models/weChatGroup.model.js';
import { WeChatContact } from '../models/weChatContact.model.js';
import { WeChatGroupMember } from '../models/weChatGroupMember.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const createPriceRecord = asyncHandler(async (req, res) => {
    // Validate product exists
    const product = await WeChatProduct.findById(req.body.productId);
    if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');

    const priceRecord = await WeChatPriceRecord.create({
        ...req.body,
        recordedBy: req.user._id
    });

    // --- AUTO-LINK RULE: Link Product <-> Group <-> Members ---
    if (req.body.groupId) {
        const { productId, groupId, contactId } = req.body;

        // A. Link Product to Group
        await WeChatProduct.findByIdAndUpdate(productId, {
            $addToSet: { wechatGroupIds: groupId }
        });

        // B. Link Group to Product
        await WeChatGroup.findByIdAndUpdate(groupId, {
            $addToSet: { productIds: productId }
        });

        // C. Link all Group Members to this Product
        const groupMembers = await WeChatGroupMember.find({ groupId });
        const memberContactIds = groupMembers.map(m => m.contactId).filter(id => id);

        if (memberContactIds.length > 0) {
            // Link Product to these Contacts
            await WeChatProduct.findByIdAndUpdate(productId, {
                $addToSet: { wechatContactIds: { $each: memberContactIds } }
            });

            // Link these Contacts to the Product
            await WeChatContact.updateMany(
                { _id: { $in: memberContactIds } },
                { $addToSet: { productIds: productId, groupIds: groupId } }
            );
        }
    } else if (req.body.contactId) {
        // Just link product to contact if no group
        await WeChatProduct.findByIdAndUpdate(req.body.productId, {
            $addToSet: { wechatContactIds: req.body.contactId }
        });
        await WeChatContact.findByIdAndUpdate(req.body.contactId, {
            $addToSet: { productIds: req.body.productId }
        });
    }
    
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, priceRecord, 'Price recorded successfully with auto-intelligence linking'));
});

// GET /api/v1/wechat/products/:productId/prices
// Returns the price comparison matrix for a single product across all suppliers
export const getProductPrices = asyncHandler(async (req, res) => {
    const { productId } = req.params;
    
    // Validate product exists
    const product = await WeChatProduct.findById(productId);
    if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');

    // Fetch all price records for this product
    const prices = await WeChatPriceRecord.find({ productId })
        .populate('contactId', 'weChatDisplayName englishName chineseName companyName weChatId')
        .populate('groupId', 'groupName groupAlias')
        .sort('-quotationDate'); // Latest quotes first

    res.send(new ApiResponse(httpStatus.OK, {
        product: {
            id: product._id,
            name: product.productName,
            code: product.productCode
        },
        prices
    }));
});

export const updatePriceRecord = asyncHandler(async (req, res) => {
    const priceRecord = await WeChatPriceRecord.findByIdAndUpdate(req.params.priceId, req.body, { new: true });
    if (!priceRecord) throw new ApiError(httpStatus.NOT_FOUND, 'Price record not found');
    res.send(new ApiResponse(httpStatus.OK, priceRecord, 'Price record updated'));
});

export const deletePriceRecord = asyncHandler(async (req, res) => {
    await WeChatPriceRecord.findByIdAndDelete(req.params.priceId);
    res.send(new ApiResponse(httpStatus.OK, null, 'Price record deleted'));
});

export const getPrices = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.productId) filter.productId = req.query.productId;
    if (req.query.contactId) filter.contactId = req.query.contactId;
    if (req.query.groupId) filter.groupId = req.query.groupId;

    const prices = await WeChatPriceRecord.find(filter)
        .populate('productId')
        .populate('contactId')
        .populate('groupId')
        .sort('-quotationDate');

    res.send(new ApiResponse(httpStatus.OK, prices));
});
