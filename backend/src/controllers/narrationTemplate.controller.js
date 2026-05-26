import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { NarrationTemplate } from '../models/narrationTemplate.model.js';

export const getAll = asyncHandler(async (req, res) => {
    const { voucherNature, search } = req.query;
    const filter = { isActive: true };
    if (voucherNature) filter.voucherNature = { $in: [voucherNature, 'Any'] };
    if (search) filter.$text = { $search: search };
    const list = await NarrationTemplate.find(filter).sort({ title: 1 }).lean();
    res.send(new ApiResponse(httpStatus.OK, list));
});

export const create = asyncHandler(async (req, res) => {
    const t = await NarrationTemplate.create({ ...req.body, createdBy: req.user?._id });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, t));
});

export const update = asyncHandler(async (req, res) => {
    const t = await NarrationTemplate.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!t) throw new ApiError(httpStatus.NOT_FOUND, 'Template not found');
    res.send(new ApiResponse(httpStatus.OK, t));
});

export const remove = asyncHandler(async (req, res) => {
    const t = await NarrationTemplate.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!t) throw new ApiError(httpStatus.NOT_FOUND, 'Template not found');
    res.send(new ApiResponse(httpStatus.OK, { message: 'Deleted' }));
});
