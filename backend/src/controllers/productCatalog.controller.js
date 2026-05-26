import pick from '../utils/pick.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as productCatalogService from '../services/productCatalog.service.js';

export const createProduct = asyncHandler(async (req, res) => {
    const doc = await productCatalogService.createProduct(req.body, req.user.id);
    res.status(201).send(new ApiResponse(201, doc, 'Product created'));
});

export const getProducts = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['search', 'category', 'isActive']);
    const options = pick(req.query, ['page', 'limit', 'sortBy']);
    const result = await productCatalogService.queryProducts(filter, options);
    res.send(new ApiResponse(200, result));
});

export const getProduct = asyncHandler(async (req, res) => {
    const doc = await productCatalogService.getProductById(req.params.id);
    res.send(new ApiResponse(200, doc));
});

export const updateProduct = asyncHandler(async (req, res) => {
    const doc = await productCatalogService.updateProduct(req.params.id, req.body, req.user.id);
    res.send(new ApiResponse(200, doc, 'Product updated'));
});

export const deleteProduct = asyncHandler(async (req, res) => {
    await productCatalogService.deleteProduct(req.params.id);
    res.send(new ApiResponse(200, null, 'Product deleted'));
});

export const uploadAsset = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No file uploaded');
    const { assetType } = req.query;
    const publicUrl = '/uploads/product-catalog/' + req.file.filename;
    const doc = await productCatalogService.setAssetUrl(req.params.id, assetType, publicUrl, req.user.id);
    res.send(new ApiResponse(200, { url: publicUrl, product: doc }, 'Asset uploaded'));
});
