import { AssetMaintenance } from '../models/assetMaintenance.model.js';
import { FixedAsset } from '../models/fixedAsset.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Joi from 'joi';

const maintenanceSchema = Joi.object({
    asset: Joi.string().required(),
    entryDate: Joi.date(),
    problemReported: Joi.string().allow(''),
    maintenanceType: Joi.string().valid('Preventive', 'Breakdown', 'Service', 'Repair', 'Calibration'),
    vendor: Joi.string().allow(''),
    cost: Joi.number().min(0),
    partsReplaced: Joi.string().allow(''),
    startDate: Joi.date().allow(null, ''),
    completionDate: Joi.date().allow(null, ''),
    warrantyClaim: Joi.boolean(),
    downtimeDays: Joi.number().min(0),
    status: Joi.string().valid('Open', 'In Progress', 'Completed'),
    remarks: Joi.string().allow('')
});

export const createMaintenance = asyncHandler(async (req, res) => {
    const { error, value } = maintenanceSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const maintenance = await AssetMaintenance.create({ ...value, createdBy: req.user._id });

    // Optionally update asset status to 'Under Repair'
    if (value.status !== 'Completed') {
        await FixedAsset.findByIdAndUpdate(value.asset, { status: 'Under Repair' });
    } else {
        await FixedAsset.findByIdAndUpdate(value.asset, { status: 'In Use' });
    }

    res.status(201).json(new ApiResponse(201, maintenance, 'Maintenance record created'));
});

export const getMaintenanceHistory = asyncHandler(async (req, res) => {
    const history = await AssetMaintenance.find({ asset: req.params.assetId }).sort({ entryDate: -1 });
    res.json(new ApiResponse(200, history, 'Maintenance history fetched'));
});
