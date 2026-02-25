import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ItemGroup } from '../models/itemGroup.model.js';

// ── LIST ──────────────────────────────────────────────────────────────────────
export const getItemGroups = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
    const groups = await ItemGroup.find(filter).sort({ name: 1 }).lean();
    res.send({ success: true, data: groups });
});

// ── CREATE ────────────────────────────────────────────────────────────────────
export const createItemGroup = asyncHandler(async (req, res) => {
    const { name, code, description, isActive } = req.body;

    const exists = await ItemGroup.findOne({ $or: [{ name: name.trim() }, { code: code.trim().toUpperCase() }] });
    if (exists) throw new ApiError(httpStatus.CONFLICT, 'Item group name or code already exists');

    const itemGroup = await ItemGroup.create({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description?.trim() || '',
        isActive: isActive !== undefined ? isActive : true,
        createdBy: req.user.id
    });
    res.status(httpStatus.CREATED).send({ success: true, data: itemGroup });
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
export const updateItemGroup = asyncHandler(async (req, res) => {
    const itemGroup = await ItemGroup.findById(req.params.id);
    if (!itemGroup) throw new ApiError(httpStatus.NOT_FOUND, 'Item group not found');

    const { name, code, description, isActive } = req.body;
    if (name !== undefined) itemGroup.name = name.trim();
    if (code !== undefined) itemGroup.code = code.trim().toUpperCase();
    if (description !== undefined) itemGroup.description = description.trim();
    if (isActive !== undefined) itemGroup.isActive = isActive;

    await itemGroup.save();
    res.send({ success: true, data: itemGroup });
});

// ── DELETE ────────────────────────────────────────────────────────────────────
export const deleteItemGroup = asyncHandler(async (req, res) => {
    const itemGroup = await ItemGroup.findById(req.params.id);
    if (!itemGroup) throw new ApiError(httpStatus.NOT_FOUND, 'Item group not found');
    await itemGroup.deleteOne();
    res.send({ success: true, message: 'Item group deleted' });
});
