import pick from '../utils/pick.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as itemImageService from '../services/itemImage.service.js';
import { ITEM_IMAGE_TYPE_LABELS } from '../constants/itemImage.constants.js';

export const getMeta = asyncHandler(async (req, res) => {
    res.send(new ApiResponse(200, {
        imageTypes: ITEM_IMAGE_TYPE_LABELS,
    }));
});

export const getEligibility = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    const data = await itemImageService.getTextileItemImageEligibility(companyId);
    res.send(new ApiResponse(200, data));
});

export const listImages = asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const { imageType } = req.query;
    const companyId = req.query.companyId || req.companyId;
    const results = await itemImageService.listItemImages(itemId, { imageType, companyId });
    res.send(new ApiResponse(200, { results }));
});

export const getImage = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    const doc = await itemImageService.getItemImageById(req.params.imageId, companyId);
    res.send(new ApiResponse(200, doc));
});

export const uploadImage = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No file uploaded');
    const body = pick(req.body, ['imageType', 'source', 'companyId']);
    const doc = await itemImageService.uploadItemImage({
        itemId: req.params.itemId,
        companyId: body.companyId || req.companyId,
        imageType: body.imageType,
        source: body.source || (req.body.scanMode === 'mobile' ? 'mobile_scan' : 'upload'),
        file: req.file,
        userId: req.user?._id || req.user?.id,
    });
    res.status(201).send(new ApiResponse(201, doc, 'Image uploaded'));
});

export const replaceImage = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No file uploaded');
    const body = pick(req.body, ['source', 'companyId']);
    const doc = await itemImageService.replaceItemImage(req.params.imageId, {
        file: req.file,
        userId: req.user?._id || req.user?.id,
        source: body.source || 'replace',
        companyId: body.companyId || req.companyId,
    });
    res.send(new ApiResponse(200, doc, 'Image replaced'));
});

export const removeImage = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.body?.companyId || req.companyId;
    await itemImageService.softDeleteItemImage(
        req.params.imageId,
        req.user?._id || req.user?.id,
        companyId,
    );
    res.send(new ApiResponse(200, null, 'Image deleted'));
});
