import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { TcsMasterSection } from '../models/tcsMasterSection.model.js';
import { TcsDeduction } from '../models/tcsDeduction.model.js';
import { TcsChallan } from '../models/tcsChallan.model.js';
import * as tcsService from '../services/tcs.service.js';

// ── Master Sections ─────────────────────────────────────────────────────────

export const getMasterSections = asyncHandler(async (req, res) => {
    const list = await TcsMasterSection.find({ isActive: true }).sort({ sectionCode: 1 }).lean();
    res.send(new ApiResponse(httpStatus.OK, list));
});

export const createMasterSection = asyncHandler(async (req, res) => {
    const s = await TcsMasterSection.create(req.body);
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, s));
});

export const updateMasterSection = asyncHandler(async (req, res) => {
    const s = await TcsMasterSection.findOneAndUpdate(
        { sectionCode: req.params.sectionCode.toUpperCase() },
        req.body,
        { new: true, runValidators: true },
    );
    if (!s) throw new ApiError(httpStatus.NOT_FOUND, 'TCS section not found');
    res.send(new ApiResponse(httpStatus.OK, s));
});

// ── Preview ──────────────────────────────────────────────────────────────────

export const postPreview = asyncHandler(async (req, res) => {
    const { sectionCode, saleAmount, buyerPan } = req.body;
    if (!sectionCode || !saleAmount) throw new ApiError(httpStatus.BAD_REQUEST, 'sectionCode and saleAmount are required');
    const result = await tcsService.previewTcs({ sectionCode, saleAmount, buyerPan });
    res.send(new ApiResponse(httpStatus.OK, result));
});

// ── Deductions ───────────────────────────────────────────────────────────────

export const getDeductions = asyncHandler(async (req, res) => {
    const { financialYear, quarter, section, status } = req.query;
    const filter = {};
    if (financialYear) filter.financialYear = financialYear;
    if (quarter) filter.quarter = quarter;
    if (section) filter.section = section.toUpperCase();
    if (status) filter.status = status;
    const list = await TcsDeduction.find(filter).sort({ transactionDate: -1 }).lean();
    res.send(new ApiResponse(httpStatus.OK, list));
});

export const createDeduction = asyncHandler(async (req, res) => {
    const d = await TcsDeduction.create({ ...req.body, createdBy: req.user?._id });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, d));
});

export const updateDeduction = asyncHandler(async (req, res) => {
    const d = await TcsDeduction.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!d) throw new ApiError(httpStatus.NOT_FOUND, 'TCS deduction not found');
    res.send(new ApiResponse(httpStatus.OK, d));
});

export const deleteDeduction = asyncHandler(async (req, res) => {
    const d = await TcsDeduction.findByIdAndDelete(req.params.id);
    if (!d) throw new ApiError(httpStatus.NOT_FOUND, 'TCS deduction not found');
    res.send(new ApiResponse(httpStatus.OK, { message: 'Deleted' }));
});

// ── Challans ─────────────────────────────────────────────────────────────────

export const getChallans = asyncHandler(async (req, res) => {
    const { financialYear, quarter } = req.query;
    const filter = {};
    if (financialYear) filter.financialYear = financialYear;
    if (quarter) filter.quarter = quarter;
    const list = await TcsChallan.find(filter).sort({ depositDate: -1 }).lean();
    res.send(new ApiResponse(httpStatus.OK, list));
});

export const createChallan = asyncHandler(async (req, res) => {
    const c = await TcsChallan.create({ ...req.body, createdBy: req.user?._id });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, c));
});

export const markChallanPaid = asyncHandler(async (req, res) => {
    const c = await TcsChallan.findByIdAndUpdate(req.params.id, { status: 'Paid' }, { new: true });
    if (!c) throw new ApiError(httpStatus.NOT_FOUND, 'Challan not found');
    // Update linked deductions status
    if (c.linkedDeductions?.length) {
        await TcsDeduction.updateMany({ _id: { $in: c.linkedDeductions } }, { status: 'Challan Paid', challanId: c._id });
    }
    res.send(new ApiResponse(httpStatus.OK, c));
});

// ── Reports ───────────────────────────────────────────────────────────────────

export const getQuarterlySummary = asyncHandler(async (req, res) => {
    const { financialYear, quarter } = req.query;
    if (!financialYear) throw new ApiError(httpStatus.BAD_REQUEST, 'financialYear is required');
    const data = await tcsService.getQuarterlySummary({ financialYear, quarter });
    res.send(new ApiResponse(httpStatus.OK, data));
});

export const getBuyerWiseSummary = asyncHandler(async (req, res) => {
    const { financialYear } = req.query;
    if (!financialYear) throw new ApiError(httpStatus.BAD_REQUEST, 'financialYear is required');
    const data = await tcsService.getBuyerWiseSummary({ financialYear });
    res.send(new ApiResponse(httpStatus.OK, data));
});

export const getDashboard = asyncHandler(async (req, res) => {
    const { financialYear } = req.query;
    if (!financialYear) throw new ApiError(httpStatus.BAD_REQUEST, 'financialYear is required');

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [deductionAgg, pendingAgg, paidAgg, deductionsThisMonth] = await Promise.all([
        TcsDeduction.aggregate([
            { $match: { financialYear } },
            { $group: { _id: null, total: { $sum: '$tcsAmount' } } },
        ]),
        TcsDeduction.aggregate([
            { $match: { financialYear, status: 'Pending' } },
            { $group: { _id: null, total: { $sum: '$tcsAmount' } } },
        ]),
        TcsDeduction.aggregate([
            { $match: { financialYear, status: 'Remitted' } },
            { $group: { _id: null, total: { $sum: '$tcsAmount' } } },
        ]),
        TcsDeduction.countDocuments({ financialYear, transactionDate: { $gte: monthStart } }),
    ]);

    res.send(new ApiResponse(httpStatus.OK, {
        financialYear,
        totalDeducted: deductionAgg[0]?.total || 0,
        totalPaid: paidAgg[0]?.total || 0,
        pendingPayment: pendingAgg[0]?.total || 0,
        deductionsThisMonth,
    }));
});
