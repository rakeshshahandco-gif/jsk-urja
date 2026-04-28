import httpStatus from 'http-status';
import { WeChatProduct } from '../models/weChatProduct.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import pick from '../utils/pick.js';

export const createProduct = asyncHandler(async (req, res) => {
    const product = await WeChatProduct.create({
        ...req.body,
        createdBy: req.user._id
    });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, product, 'Product created successfully'));
});

export const getProducts = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['isActive', 'status', 'category']);
    const options = pick(req.query, ['search']);
    
    let query = { ...filter };
    if (options.search) {
        const escapedSearch = options.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchRegex = { $regex: escapedSearch, $options: 'i' };
        query.$or = [
            { productName: searchRegex },
            { productCode: searchRegex },
            { chineseProductName: searchRegex },
            { category: searchRegex },
            { partNumber: searchRegex },
            { inventoryItemCode: searchRegex },
            { inventoryItemName: searchRegex }
        ];
    }

    const products = await WeChatProduct.find(query).sort('-createdAt');
    res.send(new ApiResponse(httpStatus.OK, products));
});

export const getProduct = asyncHandler(async (req, res) => {
    const product = await WeChatProduct.findById(req.params.productId).populate('wechatGroupIds', 'groupName groupAlias chineseGroupName');
    if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
    res.send(new ApiResponse(httpStatus.OK, product));
});

export const updateProduct = asyncHandler(async (req, res) => {
    const product = await WeChatProduct.findByIdAndUpdate(req.params.productId, req.body, { new: true });
    if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
    res.send(new ApiResponse(httpStatus.OK, product, 'Product updated'));
});

export const deleteProduct = asyncHandler(async (req, res) => {
    await WeChatProduct.findByIdAndDelete(req.params.productId);
    res.send(new ApiResponse(httpStatus.OK, null, 'Product deleted'));
});
