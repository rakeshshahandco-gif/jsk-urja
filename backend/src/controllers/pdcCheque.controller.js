import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { PdcCheque } from '../models/pdcCheque.model.js';

export const getAll = asyncHandler(async (req, res) => {
    const { type, status, financialYear, fromDate, toDate } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (financialYear) filter.financialYear = financialYear;
    if (fromDate || toDate) {
        filter.chequeDate = {};
        if (fromDate) filter.chequeDate.$gte = new Date(fromDate);
        if (toDate) filter.chequeDate.$lte = new Date(toDate);
    }
    const list = await PdcCheque.find(filter).sort({ chequeDate: 1 }).lean();
    res.send(new ApiResponse(httpStatus.OK, list));
});

export const getById = asyncHandler(async (req, res) => {
    const pdc = await PdcCheque.findById(req.params.id).lean();
    if (!pdc) throw new ApiError(httpStatus.NOT_FOUND, 'PDC cheque not found');
    res.send(new ApiResponse(httpStatus.OK, pdc));
});

export const create = asyncHandler(async (req, res) => {
    const pdc = await PdcCheque.create({ ...req.body, createdBy: req.user?._id });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, pdc));
});

export const update = asyncHandler(async (req, res) => {
    const pdc = await PdcCheque.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!pdc) throw new ApiError(httpStatus.NOT_FOUND, 'PDC cheque not found');
    res.send(new ApiResponse(httpStatus.OK, pdc));
});

export const present = asyncHandler(async (req, res) => {
    const pdc = await PdcCheque.findById(req.params.id);
    if (!pdc) throw new ApiError(httpStatus.NOT_FOUND, 'PDC cheque not found');
    if (pdc.status !== 'Pending') throw new ApiError(httpStatus.BAD_REQUEST, `Cannot present a cheque in status: ${pdc.status}`);
    pdc.status = 'Presented';
    pdc.presentedDate = req.body.presentedDate || new Date();
    await pdc.save();
    res.send(new ApiResponse(httpStatus.OK, pdc));
});

export const clear = asyncHandler(async (req, res) => {
    const pdc = await PdcCheque.findById(req.params.id);
    if (!pdc) throw new ApiError(httpStatus.NOT_FOUND, 'PDC cheque not found');
    if (!['Pending', 'Presented'].includes(pdc.status)) throw new ApiError(httpStatus.BAD_REQUEST, `Cannot clear a cheque in status: ${pdc.status}`);
    pdc.status = 'Cleared';
    pdc.clearedDate = req.body.clearedDate || new Date();
    if (req.body.clearedVoucherId) pdc.clearedVoucherId = req.body.clearedVoucherId;
    if (req.body.clearedVoucherNo) pdc.clearedVoucherNo = req.body.clearedVoucherNo;
    await pdc.save();
    res.send(new ApiResponse(httpStatus.OK, pdc));
});

export const bounce = asyncHandler(async (req, res) => {
    const pdc = await PdcCheque.findById(req.params.id);
    if (!pdc) throw new ApiError(httpStatus.NOT_FOUND, 'PDC cheque not found');
    pdc.status = 'Bounced';
    pdc.bounceReason = req.body.bounceReason || '';
    await pdc.save();
    res.send(new ApiResponse(httpStatus.OK, pdc));
});

export const cancel = asyncHandler(async (req, res) => {
    const pdc = await PdcCheque.findById(req.params.id);
    if (!pdc) throw new ApiError(httpStatus.NOT_FOUND, 'PDC cheque not found');
    pdc.status = 'Cancelled';
    await pdc.save();
    res.send(new ApiResponse(httpStatus.OK, pdc));
});

export const getDueSoon = asyncHandler(async (req, res) => {
    const days = parseInt(req.query.days || '7', 10);
    const today = new Date();
    const until = new Date(today);
    until.setDate(until.getDate() + days);
    const list = await PdcCheque.find({
        status: 'Pending',
        chequeDate: { $gte: today, $lte: until },
    }).sort({ chequeDate: 1 }).lean();
    res.send(new ApiResponse(httpStatus.OK, list));
});
