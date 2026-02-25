import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ItemType } from '../models/itemType.model.js';

// ── LIST ──────────────────────────────────────────────────────────────────────
export const getItemTypes = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
    const types = await ItemType.find(filter).sort({ name: 1 }).lean();
    res.send({ success: true, data: types });
});

// ── CREATE ────────────────────────────────────────────────────────────────────
export const createItemType = asyncHandler(async (req, res) => {
    const { name, code, description, isElectrical } = req.body;

    const exists = await ItemType.findOne({ $or: [{ name: name.trim() }, { code: code.trim().toUpperCase() }] });
    if (exists) throw new ApiError(httpStatus.CONFLICT, 'Item type name or code already exists');

    const itemType = await ItemType.create({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description?.trim() || '',
        isElectrical: !!isElectrical,
        createdBy: req.user.id
    });
    res.status(httpStatus.CREATED).send({ success: true, data: itemType });
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
export const updateItemType = asyncHandler(async (req, res) => {
    const itemType = await ItemType.findById(req.params.id);
    if (!itemType) throw new ApiError(httpStatus.NOT_FOUND, 'Item type not found');

    const { name, code, description, isElectrical, isActive } = req.body;
    if (name !== undefined) itemType.name = name.trim();
    if (code !== undefined) itemType.code = code.trim().toUpperCase();
    if (description !== undefined) itemType.description = description.trim();
    if (isElectrical !== undefined) itemType.isElectrical = isElectrical;
    if (isActive !== undefined) itemType.isActive = isActive;

    await itemType.save();
    res.send({ success: true, data: itemType });
});

// ── DELETE ────────────────────────────────────────────────────────────────────
export const deleteItemType = asyncHandler(async (req, res) => {
    const itemType = await ItemType.findById(req.params.id);
    if (!itemType) throw new ApiError(httpStatus.NOT_FOUND, 'Item type not found');
    await itemType.deleteOne();
    res.send({ success: true, message: 'Item type deleted' });
});
