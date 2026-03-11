import { AssetTransfer } from '../models/assetTransfer.model.js';
import { FixedAsset } from '../models/fixedAsset.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Joi from 'joi';

const transferSchema = Joi.object({
    asset: Joi.string().required(),
    transferDate: Joi.date(),
    toLocation: Joi.string().allow(null, ''),
    toDepartment: Joi.string().allow(''),
    toUser: Joi.string().allow(null, ''),
    reason: Joi.string().allow(''),
    remarks: Joi.string().allow(''),
    approvedBy: Joi.string().allow(null, '')
});

export const createTransfer = asyncHandler(async (req, res) => {
    const { error, value } = transferSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const asset = await FixedAsset.findById(value.asset);
    if (!asset) throw new ApiError(404, 'Asset not found');

    const transfer = await AssetTransfer.create({
        ...value,
        fromLocation: asset.location,
        fromDepartment: asset.department,
        fromUser: asset.assignedTo,
        createdBy: req.user._id
    });

    // Update current asset location/responsibility
    asset.location = value.toLocation || asset.location;
    asset.department = value.toDepartment || asset.department;
    asset.assignedTo = value.toUser || asset.assignedTo;
    await asset.save();

    res.status(201).json(new ApiResponse(201, transfer, 'Asset Transfer recorded and updated'));
});

export const getTransfersByAsset = asyncHandler(async (req, res) => {
    const transfers = await AssetTransfer.find({ asset: req.params.assetId })
        .populate('fromLocation toLocation fromUser toUser approvedBy createdBy')
        .sort({ transferDate: -1 });
    res.json(new ApiResponse(200, transfers, 'Transfers fetched'));
});
