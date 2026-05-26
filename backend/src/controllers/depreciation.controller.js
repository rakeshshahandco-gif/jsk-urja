import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { FixedAsset } from '../models/fixedAsset.model.js';
import { AssetDepreciation } from '../models/assetDepreciation.model.js';
import * as depService from '../services/depreciation.service.js';

export const preview = asyncHandler(async (req, res) => {
    const { periodStart, periodEnd } = req.query;
    if (!periodStart || !periodEnd) throw new ApiError(httpStatus.BAD_REQUEST, 'periodStart and periodEnd required');
    const data = await depService.runDepreciation({ periodStart, periodEnd, dryRun: true });
    res.send(new ApiResponse(httpStatus.OK, data));
});

export const run = asyncHandler(async (req, res) => {
    const { periodStart, periodEnd } = req.body;
    if (!periodStart || !periodEnd) throw new ApiError(httpStatus.BAD_REQUEST, 'periodStart and periodEnd required');
    const data = await depService.runDepreciation({ periodStart, periodEnd, dryRun: false, createdBy: req.user?._id });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, data));
});

export const getHistory = asyncHandler(async (req, res) => {
    const list = await AssetDepreciation.find({}).sort({ runDate: -1 }).lean();
    res.send(new ApiResponse(httpStatus.OK, list));
});

export const getSchedule = asyncHandler(async (req, res) => {
    const { assetId, years } = req.query;
    if (!assetId) throw new ApiError(httpStatus.BAD_REQUEST, 'assetId is required');
    const asset = await FixedAsset.findById(assetId).lean();
    if (!asset) throw new ApiError(httpStatus.NOT_FOUND, 'Asset not found');
    const schedule = depService.buildDepreciationSchedule(asset, parseInt(years || '10', 10));
    res.send(new ApiResponse(httpStatus.OK, { asset: { _id: asset._id, assetName: asset.assetName, currentBookValue: asset.currentBookValue, depreciationRate: asset.depreciationRate }, schedule }));
});
