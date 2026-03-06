import httpStatus from 'http-status';
import { Sticker } from '../models/sticker.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getStickers = asyncHandler(async (req, res) => {
    const stickers = await Sticker.find({ isActive: req.query.isActive !== 'false' }).sort({ name: 1 });
    res.send(new ApiResponse(200, stickers, 'Stickers fetched successfully'));
});

export const getStickerById = asyncHandler(async (req, res) => {
    const sticker = await Sticker.findById(req.params.id);
    if (!sticker) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Sticker not found');
    }
    res.send(new ApiResponse(200, sticker));
});

export const createSticker = asyncHandler(async (req, res) => {
    const { name, color, description } = req.body;

    const existing = await Sticker.findOne({ name });
    if (existing) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Sticker with this name already exists');
    }

    const sticker = await Sticker.create({
        name,
        color,
        description,
        createdBy: req.user.id,
    });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, sticker, 'Sticker created successfully'));
});

export const updateSticker = asyncHandler(async (req, res) => {
    const sticker = await Sticker.findById(req.params.id);
    if (!sticker) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Sticker not found');
    }

    if (req.body.name && req.body.name !== sticker.name) {
        const existing = await Sticker.findOne({ name: req.body.name });
        if (existing) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Sticker with this name already exists');
        }
    }

    Object.assign(sticker, req.body);
    await sticker.save();
    res.send(new ApiResponse(200, sticker, 'Sticker updated successfully'));
});

export const deleteSticker = asyncHandler(async (req, res) => {
    const sticker = await Sticker.findById(req.params.id);
    if (!sticker) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Sticker not found');
    }
    await sticker.deleteOne();
    res.send(new ApiResponse(200, null, 'Sticker deleted successfully'));
});
