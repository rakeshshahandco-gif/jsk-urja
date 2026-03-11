import { AssetDisposal } from '../models/assetDisposal.model.js';
import { FixedAsset } from '../models/fixedAsset.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Joi from 'joi';

const disposalSchema = Joi.object({
    asset: Joi.string().required(),
    disposalDate: Joi.date(),
    disposalType: Joi.string().valid('Sold', 'Scrapped', 'Discarded', 'Lost', 'Damaged Beyond Repair').required(),
    saleValue: Joi.number().min(0),
    buyerName: Joi.string().allow(''),
    invoiceNo: Joi.string().allow(''),
    remarks: Joi.string().allow(''),
    approvedBy: Joi.string().allow(null, '')
});

export const disposeAsset = asyncHandler(async (req, res) => {
    const { error, value } = disposalSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const asset = await FixedAsset.findById(value.asset);
    if (!asset) throw new ApiError(404, 'Asset not found');
    if (asset.status === 'Sold' || asset.status === 'Scrapped') throw new ApiError(400, 'Asset already disposed');

    const profitOrLoss = (value.saleValue || 0) - asset.currentBookValue;

    const disposal = await AssetDisposal.create({
        ...value,
        originalCost: asset.capitalizedCost,
        accumulatedDepreciation: asset.accumulatedDepreciation,
        bookValue: asset.currentBookValue,
        profitOrLoss,
        createdBy: req.user._id
    });

    // Update asset status
    asset.status = value.disposalType === 'Sold' ? 'Sold' : 'Scrapped';
    asset.isActive = false;
    await asset.save();

    res.status(201).json(new ApiResponse(201, disposal, 'Asset Disposal completed'));
});
