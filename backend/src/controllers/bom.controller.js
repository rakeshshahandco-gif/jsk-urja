import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BOM } from '../models/bom.model.js';
import { Item } from '../models/item.model.js';
import pick from '../utils/pick.js';

// ── CREATE ────────────────────────────────────────────────────────────────────
export const createBOM = asyncHandler(async (req, res) => {
    const bomBody = req.body;

    // Generate BOM Number if not provided
    if (!bomBody.bomNumber) {
        const item = await Item.findById(bomBody.finishedProductId);
        if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'Finished Product not found');

        const count = await BOM.countDocuments();
        const prefix = item.itemCode.substring(0, 5);
        bomBody.bomNumber = `BOM-${prefix}-${(count + 1).toString().padStart(3, '0')}`;
    }

    const exists = await BOM.findOne({ bomNumber: bomBody.bomNumber.toUpperCase() });
    if (exists) throw new ApiError(httpStatus.CONFLICT, 'BOM Number already exists');

    // If setting as default, unset others for this product
    if (bomBody.isDefault) {
        await BOM.updateMany({ finishedProductId: bomBody.finishedProductId }, { isDefault: false });
    }

    const bom = await BOM.create({
        ...bomBody,
        createdBy: req.user.id
    });

    res.status(httpStatus.CREATED).send({ success: true, data: bom });
});

// ── LIST ──────────────────────────────────────────────────────────────────────
export const getBOMs = asyncHandler(async (req, res) => {
    const filters = pick(req.query, ['finishedProductId', 'bomNumber', 'search', 'status', 'bomType']);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    const query = {};
    if (filters.finishedProductId) query.finishedProductId = filters.finishedProductId;
    if (filters.status) query.status = filters.status;
    if (filters.bomType) query.bomType = filters.bomType;
    // support both `bomNumber` and `search` for flexible querying
    const searchTerm = filters.search || filters.bomNumber;
    if (searchTerm) query.bomNumber = { $regex: searchTerm, $options: 'i' };

    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 10;
    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const skip = (page - 1) * limit;

    const boms = await BOM.find(query)
        .populate('finishedProductId', 'itemName itemCode itemCategory uom')
        .sort(options.sortBy || '-createdAt')
        .skip(skip)
        .limit(limit);

    const totalResults = await BOM.countDocuments(query);

    res.send({
        success: true,
        data: boms,
        page,
        limit,
        totalPages: Math.ceil(totalResults / limit),
        totalResults
    });
});

// ── GET BY ID ─────────────────────────────────────────────────────────────────
export const getBOM = asyncHandler(async (req, res) => {
    const bom = await BOM.findById(req.params.id)
        .populate('finishedProductId', 'itemName itemCode itemCategory uom')
        .populate('components.itemId', 'itemName itemCode uom itemCategory purchaseRate');

    if (!bom) throw new ApiError(httpStatus.NOT_FOUND, 'BOM not found');
    res.send({ success: true, data: bom });
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
export const updateBOM = asyncHandler(async (req, res) => {
    const bom = await BOM.findById(req.params.id);
    if (!bom) throw new ApiError(httpStatus.NOT_FOUND, 'BOM not found');

    // If setting as default, unset others for this product
    if (req.body.isDefault && !bom.isDefault) {
        await BOM.updateMany({ finishedProductId: bom.finishedProductId }, { isDefault: false });
    }

    const updatedBOM = await BOM.findByIdAndUpdate(
        req.params.id,
        { ...req.body, updatedBy: req.user.id },
        { new: true, runValidators: true }
    );

    res.send({ success: true, data: updatedBOM });
});

// ── DELETE ────────────────────────────────────────────────────────────────────
export const deleteBOM = asyncHandler(async (req, res) => {
    const bom = await BOM.findById(req.params.id);
    if (!bom) throw new ApiError(httpStatus.NOT_FOUND, 'BOM not found');
    await bom.deleteOne();
    res.send({ success: true, message: 'BOM deleted successfully' });
});
