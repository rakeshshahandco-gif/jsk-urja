import { Supplier } from '../models/supplier.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import Joi from 'joi';

const supplierSchema = Joi.object({
    supplierName: Joi.string().required(),
    contactPerson: Joi.string().optional().allow(''),
    phone: Joi.string().optional().allow(''),
    email: Joi.string().email().optional().allow(''),
    address: Joi.string().optional().allow(''),
    area: Joi.string().optional().allow(''),
    city: Joi.string().optional().allow(''),
    state: Joi.string().optional().allow(''),
    pincode: Joi.string().optional().allow(''),
    country: Joi.string().optional().allow(''),
    gstNumber: Joi.string().optional().allow(''),
    gstType: Joi.string().valid('CGST / SGST', 'IGST', '').optional().allow(''),
    panNumber: Joi.string().optional().allow(''),
    paymentTerms: Joi.string().optional().allow(''),
    bankName: Joi.string().optional().allow(''),
    bankAccountNo: Joi.string().optional().allow(''),
    bankIfsc: Joi.string().optional().allow(''),
    isActive: Joi.boolean().optional(),
    remarks: Joi.string().optional().allow(''),
});

// Auto-generate supplier code
const generateSupplierCode = async () => {
    const count = await Supplier.countDocuments();
    return `SUP-${String(count + 1).padStart(4, '0')}`;
};

export const createSupplier = asyncHandler(async (req, res) => {
    const { error, value } = supplierSchema.validate(req.body, { allowUnknown: true });
    if (error) throw new ApiError(400, error.details[0].message);

    const supplierCode = await generateSupplierCode();
    const supplier = await Supplier.create({ ...value, supplierCode, createdBy: req.user._id });
    res.status(201).json(new ApiResponse(201, supplier, 'Supplier created'));
});

export const getSuppliers = asyncHandler(async (req, res) => {
    const { search, isActive, page = 1, limit = 50 } = req.query;
    const query = {};
    if (search) query.$or = [{ supplierName: { $regex: search, $options: 'i' } }, { supplierCode: { $regex: search, $options: 'i' } }];
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Supplier.countDocuments(query);
    const suppliers = await Supplier.find(query).sort({ supplierName: 1 }).skip(skip).limit(Number(limit));

    res.json(new ApiResponse(200, { suppliers, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }, 'Suppliers fetched'));
});

export const getSupplierById = asyncHandler(async (req, res) => {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw new ApiError(404, 'Supplier not found');
    res.json(new ApiResponse(200, supplier, 'Supplier fetched'));
});

export const updateSupplier = asyncHandler(async (req, res) => {
    const { error, value } = supplierSchema.validate(req.body, { allowUnknown: true });
    if (error) throw new ApiError(400, error.details[0].message);

    const supplier = await Supplier.findByIdAndUpdate(
        req.params.id, { ...value, updatedBy: req.user._id }, { new: true }
    );
    if (!supplier) throw new ApiError(404, 'Supplier not found');
    res.json(new ApiResponse(200, supplier, 'Supplier updated'));
});

export const deleteSupplier = asyncHandler(async (req, res) => {
    const supplier = await Supplier.findByIdAndDelete(req.params.id);
    if (!supplier) throw new ApiError(404, 'Supplier not found');
    res.json(new ApiResponse(200, null, 'Supplier deleted'));
});
