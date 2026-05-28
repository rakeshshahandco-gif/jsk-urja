import httpStatus from 'http-status';
import { FinancialYear } from '../models/financialYear.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const createFY = asyncHandler(async (req, res) => {
    const { name, startDate, endDate, isCurrent, remarks } = req.body;

    const existing = await FinancialYear.findOne({ name });
    if (existing) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Financial Year with this name already exists');
    }

    const fy = await FinancialYear.create({
        name,
        startDate,
        endDate,
        isCurrent,
        remarks,
        createdBy: req.user.id
    });

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, fy, 'Financial Year created successfully'));
});

/** Ensure at least current + previous Indian FY exist (fresh / Render DB with no rows). */
const ensureBaselineFinancialYears = async () => {
    const count = await FinancialYear.countDocuments();
    if (count > 0) return;
    const now = new Date();
    const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const prev = startYear - 1;
    const rows = [
        {
            name: `${prev}-${startYear}`,
            startDate: new Date(prev, 3, 1),
            endDate: new Date(startYear, 2, 31, 23, 59, 59),
            status: 'Active',
            isCurrent: false,
        },
        {
            name: `${startYear}-${startYear + 1}`,
            startDate: new Date(startYear, 3, 1),
            endDate: new Date(startYear + 1, 2, 31, 23, 59, 59),
            status: 'Active',
            isCurrent: true,
        },
    ];
    for (const row of rows) {
        await FinancialYear.findOneAndUpdate(
            { name: row.name },
            { $setOnInsert: row },
            { upsert: true }
        );
    }
};

export const getFYs = asyncHandler(async (req, res) => {
    await ensureBaselineFinancialYears();
    const fys = await FinancialYear.find().sort({ startDate: -1 });
    res.send(new ApiResponse(httpStatus.OK, fys, 'Financial Years fetched successfully'));
});

export const getFYById = asyncHandler(async (req, res) => {
    const fy = await FinancialYear.findById(req.params.id);
    if (!fy) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Financial Year not found');
    }
    res.send(new ApiResponse(httpStatus.OK, fy, 'Financial Year fetched successfully'));
});

export const updateFY = asyncHandler(async (req, res) => {
    const fy = await FinancialYear.findById(req.params.id);
    if (!fy) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Financial Year not found');
    }

    Object.assign(fy, req.body);
    await fy.save();

    res.send(new ApiResponse(httpStatus.OK, fy, 'Financial Year updated successfully'));
});

export const deleteFY = asyncHandler(async (req, res) => {
    const fy = await FinancialYear.findById(req.params.id);
    if (!fy) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Financial Year not found');
    }
    
    // Check if it's currently used in transactions (optional but recommended)
    // For now, simple delete
    await fy.deleteOne();
    res.send(new ApiResponse(httpStatus.OK, null, 'Financial Year deleted successfully'));
});

export const getCurrentFY = asyncHandler(async (req, res) => {
    let fy = await FinancialYear.findOne({ isCurrent: true });
    
    if (!fy) {
        // If none marked as current, try to find one matching today's date
        const today = new Date();
        fy = await FinancialYear.findOne({
            startDate: { $lte: today },
            endDate: { $gte: today }
        });
    }

    if (!fy) {
        // Fallback to latest one
        fy = await FinancialYear.findOne().sort({ startDate: -1 });
    }

    res.send(new ApiResponse(httpStatus.OK, fy, 'Current Financial Year fetched successfully'));
});

export const setCurrentFY = asyncHandler(async (req, res) => {
    const fy = await FinancialYear.findById(req.params.id);
    if (!fy) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Financial Year not found');
    }

    fy.isCurrent = true;
    await fy.save(); // pre-save hook handles others

    res.send(new ApiResponse(httpStatus.OK, fy, 'Financial Year set as current'));
});
