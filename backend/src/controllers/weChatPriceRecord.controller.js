import httpStatus from 'http-status';
import { WeChatPriceRecord } from '../models/weChatPriceRecord.model.js';
import { WeChatProduct } from '../models/weChatProduct.model.js';
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
    
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, priceRecord, 'Price recorded successfully'));
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
