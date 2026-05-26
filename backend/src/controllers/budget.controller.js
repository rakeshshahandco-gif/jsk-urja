import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { Budget } from '../models/budget.model.js';
import * as budgetService from '../services/budget.service.js';

export const getAll = asyncHandler(async (req, res) => {
    const { financialYear } = req.query;
    const filter = { isActive: true };
    if (financialYear) filter.financialYear = financialYear;
    const list = await Budget.find(filter).sort({ createdAt: -1 }).lean();
    res.send(new ApiResponse(httpStatus.OK, list));
});

export const getById = asyncHandler(async (req, res) => {
    const b = await Budget.findById(req.params.id).lean();
    if (!b) throw new ApiError(httpStatus.NOT_FOUND, 'Budget not found');
    res.send(new ApiResponse(httpStatus.OK, b));
});

export const create = asyncHandler(async (req, res) => {
    const b = await Budget.create({ ...req.body, createdBy: req.user?._id });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, b));
});

export const update = asyncHandler(async (req, res) => {
    const b = await Budget.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!b) throw new ApiError(httpStatus.NOT_FOUND, 'Budget not found');
    res.send(new ApiResponse(httpStatus.OK, b));
});

export const remove = asyncHandler(async (req, res) => {
    const b = await Budget.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!b) throw new ApiError(httpStatus.NOT_FOUND, 'Budget not found');
    res.send(new ApiResponse(httpStatus.OK, { message: 'Budget deactivated' }));
});

export const getVsActual = asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) throw new ApiError(httpStatus.BAD_REQUEST, 'startDate and endDate are required');
    const data = await budgetService.getBudgetVsActual({ budgetId: req.params.id, startDate, endDate });
    res.send(new ApiResponse(httpStatus.OK, data));
});
