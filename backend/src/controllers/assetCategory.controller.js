import { AssetCategory } from '../models/assetCategory.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Joi from 'joi';

const categorySchema = Joi.object({
    name: Joi.string().required(),
    parentGroup: Joi.string().allow(''),
    codePrefix: Joi.string().required().uppercase(),
    depreciationApplicable: Joi.boolean(),
    depreciationMethod: Joi.string().valid('Straight Line Method', 'Written Down Value', 'None'),
    depreciationRate: Joi.number().min(0).max(100),
    usefulLife: Joi.number().min(0),
    assetLedger: Joi.string().allow(null, ''),
    depreciationLedger: Joi.string().allow(null, ''),
    accumulatedDepreciationLedger: Joi.string().allow(null, ''),
    isActive: Joi.boolean()
});

export const createCategory = asyncHandler(async (req, res) => {
    const { error, value } = categorySchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const exists = await AssetCategory.findOne({ name: value.name });
    if (exists) throw new ApiError(400, 'Category with this name already exists');

    const category = await AssetCategory.create({ ...value, createdBy: req.user._id });
    res.status(201).json(new ApiResponse(201, category, 'Asset Category created successfully'));
});

export const getCategories = asyncHandler(async (req, res) => {
    const categories = await AssetCategory.find({ isActive: true }).sort({ name: 1 });
    res.json(new ApiResponse(200, categories, 'Categories fetched'));
});

export const updateCategory = asyncHandler(async (req, res) => {
    const { error, value } = categorySchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const category = await AssetCategory.findByIdAndUpdate(
        req.params.id,
        { ...value, updatedBy: req.user._id },
        { new: true }
    );
    if (!category) throw new ApiError(404, 'Category not found');
    res.json(new ApiResponse(200, category, 'Category updated'));
});

export const deleteCategory = asyncHandler(async (req, res) => {
    const category = await AssetCategory.findByIdAndUpdate(req.params.id, { isActive: false });
    if (!category) throw new ApiError(404, 'Category not found');
    res.json(new ApiResponse(200, null, 'Category deleted'));
});
