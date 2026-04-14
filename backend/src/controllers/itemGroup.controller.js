import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ItemGroup } from '../models/itemGroup.model.js';
import { Item } from '../models/item.model.js';
import mongoose from 'mongoose';

// ── LIST ──────────────────────────────────────────────────────────────────────
export const getItemGroups = asyncHandler(async (req, res) => {
    const { search, isActive } = req.query;
    const filter = {};
    
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    
    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { code: { $regex: search, $options: 'i' } }
        ];
    }

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
    const oldName = itemGroup.name;
    const newName = name?.trim();

    if (newName !== undefined && newName !== oldName) {
        // Check if final new name already exists elsewhere
        const exists = await ItemGroup.findOne({ 
            name: newName, 
            _id: { $ne: itemGroup._id } 
        });
        
        if (exists) throw new ApiError(httpStatus.CONFLICT, 'Another item group with this name already exists');
        
        console.log(`Renaming Item Group from "${oldName}" to "${newName}"...`);
        
        // Escape special characters for regex
        const escapedOldName = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Cascade update to Items (Case-Insensitive match)
        const updateResult = await Item.updateMany(
            { itemGroupName: { $regex: new RegExp(`^${escapedOldName}$`, 'i') } },
            { itemGroupName: newName }
        );
        
        console.log(`Successfully updated ${updateResult.modifiedCount} items.`);
        itemGroup.name = newName;
    }

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
