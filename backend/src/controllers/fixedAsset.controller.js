import { FixedAsset } from '../models/fixedAsset.model.js';
import { AssetCategory } from '../models/assetCategory.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Joi from 'joi';

const assetSchema = Joi.object({
    assetName: Joi.string().required(),
    assetShortName: Joi.string().allow(''),
    category: Joi.string().required(),
    assetDescription: Joi.string().allow(''),
    brand: Joi.string().allow(''),
    modelNo: Joi.string().allow(''),
    serialNo: Joi.string().allow(''),
    identificationNo: Joi.string().allow(''),
    barcodeNo: Joi.string().allow(''),
    manufacturerName: Joi.string().allow(''),
    trackingType: Joi.string().valid('Individual Asset Tracking', 'Quantity Based Tracking'),
    quantity: Joi.number().min(1),
    supplier: Joi.string().allow(null, ''),
    purchaseInvoiceNo: Joi.string().allow(''),
    purchaseInvoiceDate: Joi.date().allow(null, ''),
    purchaseDate: Joi.date().required(),
    installationDate: Joi.date().allow(null, ''),
    putToUseDate: Joi.date().allow(null, ''),
    purchaseValue: Joi.number().min(0),
    gstAmount: Joi.number().min(0),
    freightCharges: Joi.number().min(0),
    installationCharges: Joi.number().min(0),
    otherCharges: Joi.number().min(0),
    capitalizedCost: Joi.number().required(),
    depreciationApplicable: Joi.boolean(),
    depreciationMethod: Joi.string().valid('Straight Line Method', 'Written Down Value', 'None'),
    depreciationRate: Joi.number().min(0).max(100),
    usefulLife: Joi.number().min(0),
    residualValue: Joi.number().min(0),
    location: Joi.string().allow(null, ''),
    department: Joi.string().allow(''),
    assignedTo: Joi.string().allow(null, ''),
    custodian: Joi.string().allow(''),
    status: Joi.string().valid('In Use', 'In Store', 'Under Repair', 'Under Maintenance', 'Idle', 'Disposed', 'Sold', 'Scrapped'),
    condition: Joi.string().valid('New', 'Good', 'Average', 'Damaged', 'Not Working'),
    warrantyAvailable: Joi.boolean(),
    warrantyStartDate: Joi.date().allow(null, ''),
    warrantyEndDate: Joi.date().allow(null, ''),
    amcAvailable: Joi.boolean(),
    amcStartDate: Joi.date().allow(null, ''),
    amcEndDate: Joi.date().allow(null, ''),
    insuranceAvailable: Joi.boolean(),
    insurancePolicyNo: Joi.string().allow(''),
    insuranceEndDate: Joi.date().allow(null, ''),
    remarks: Joi.string().allow('')
});

const generateAssetCode = async (categoryId) => {
    const category = await AssetCategory.findById(categoryId);
    if (!category) throw new ApiError(404, 'Category not found for code generation');

    const prefix = category.codePrefix || 'AST';
    const count = await FixedAsset.countDocuments({ category: categoryId });
    return `${prefix}${String(count + 1).padStart(3, '0')}`;
};

export const createAsset = asyncHandler(async (req, res) => {
    const { error, value } = assetSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const assetCode = await generateAssetCode(value.category);

    const asset = await FixedAsset.create({
        ...value,
        assetCode,
        currentBookValue: value.capitalizedCost, // Initially, book value is capitalized cost
        createdBy: req.user._id
    });

    res.status(201).json(new ApiResponse(201, asset, 'Fixed Asset registered successfully'));
});

export const getAssets = asyncHandler(async (req, res) => {
    const { search, category, location, status, page = 1, limit = 50 } = req.query;

    const query = { isActive: true };
    if (search) {
        query.$or = [
            { assetName: { $regex: search, $options: 'i' } },
            { assetCode: { $regex: search, $options: 'i' } },
            { serialNo: { $regex: search, $options: 'i' } }
        ];
    }
    if (category) query.category = category;
    if (location) query.location = location;
    if (status) query.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const total = await FixedAsset.countDocuments(query);
    const assets = await FixedAsset.find(query)
        .populate('category', 'name codePrefix')
        .populate('location', 'name')
        .populate('assignedTo', 'firstName lastName')
        .sort({ assetCode: 1 })
        .skip(skip)
        .limit(Number(limit));

    res.json(new ApiResponse(200, { assets, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }, 'Fixed Assets fetched'));
});

export const getAssetById = asyncHandler(async (req, res) => {
    const asset = await FixedAsset.findById(req.params.id)
        .populate('category')
        .populate('location')
        .populate('assignedTo', 'firstName lastName')
        .populate('supplier', 'supplierName');
    if (!asset) throw new ApiError(404, 'Asset not found');
    res.json(new ApiResponse(200, asset, 'Asset fetched'));
});

export const updateAsset = asyncHandler(async (req, res) => {
    const { error, value } = assetSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const asset = await FixedAsset.findByIdAndUpdate(
        req.params.id,
        { ...value, updatedBy: req.user._id },
        { new: true }
    );
    if (!asset) throw new ApiError(404, 'Asset not found');
    res.json(new ApiResponse(200, asset, 'Asset updated'));
});
