import { AssetLocation } from '../models/assetLocation.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Joi from 'joi';

const locationSchema = Joi.object({
    name: Joi.string().required(),
    branch: Joi.string().allow(''),
    department: Joi.string().allow(''),
    parentLocation: Joi.string().allow(null, ''),
    isActive: Joi.boolean()
});

export const createLocation = asyncHandler(async (req, res) => {
    const { error, value } = locationSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const location = await AssetLocation.create({ ...value, createdBy: req.user._id });
    res.status(201).json(new ApiResponse(201, location, 'Asset Location created successfully'));
});

export const getLocations = asyncHandler(async (req, res) => {
    const locations = await AssetLocation.find({ isActive: true }).sort({ name: 1 });
    res.json(new ApiResponse(200, locations, 'Locations fetched'));
});

export const updateLocation = asyncHandler(async (req, res) => {
    const { error, value } = locationSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const location = await AssetLocation.findByIdAndUpdate(
        req.params.id,
        { ...value, updatedBy: req.user._id },
        { new: true }
    );
    if (!location) throw new ApiError(404, 'Location not found');
    res.json(new ApiResponse(200, location, 'Location updated'));
});

export const deleteLocation = asyncHandler(async (req, res) => {
    const location = await AssetLocation.findByIdAndUpdate(req.params.id, { isActive: false });
    if (!location) throw new ApiError(404, 'Location not found');
    res.json(new ApiResponse(200, null, 'Location deleted'));
});
