import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { CostCenter } from '../models/costCenter.model.js';
import * as costCenterService from '../services/costCenter.service.js';

export const getAll = asyncHandler(async (req, res) => {
    const { type, flat } = req.query;
    if (flat === 'true') {
        const filter = { isActive: true };
        if (type) filter.type = type;
        const list = await CostCenter.find(filter).sort({ name: 1 }).lean();
        return res.send(new ApiResponse(httpStatus.OK, list));
    }
    const tree = await costCenterService.getCostCenterTree();
    res.send(new ApiResponse(httpStatus.OK, tree));
});

export const getById = asyncHandler(async (req, res) => {
    const cc = await CostCenter.findById(req.params.id).lean();
    if (!cc) throw new ApiError(httpStatus.NOT_FOUND, 'Cost centre not found');
    res.send(new ApiResponse(httpStatus.OK, cc));
});

export const create = asyncHandler(async (req, res) => {
    const cc = await CostCenter.create({ ...req.body, createdBy: req.user?._id });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, cc));
});

export const update = asyncHandler(async (req, res) => {
    const cc = await CostCenter.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!cc) throw new ApiError(httpStatus.NOT_FOUND, 'Cost centre not found');
    res.send(new ApiResponse(httpStatus.OK, cc));
});

export const remove = asyncHandler(async (req, res) => {
    const cc = await CostCenter.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!cc) throw new ApiError(httpStatus.NOT_FOUND, 'Cost centre not found');
    res.send(new ApiResponse(httpStatus.OK, { message: 'Deactivated successfully' }));
});

export const getPL = asyncHandler(async (req, res) => {
    const { startDate, endDate, costCenterId } = req.query;
    if (!startDate || !endDate) throw new ApiError(httpStatus.BAD_REQUEST, 'startDate and endDate are required');
    const data = await costCenterService.getCostCenterPL({ startDate, endDate, costCenterId });
    res.send(new ApiResponse(httpStatus.OK, data));
});
