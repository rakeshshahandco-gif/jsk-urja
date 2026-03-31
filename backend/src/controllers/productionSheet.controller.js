import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ProductionSheet } from '../models/productionSheet.model.js';

// GET SINGLE
export const getPSById = asyncHandler(async (req, res) => {
    const ps = await ProductionSheet.findById(req.params.id).populate('soId', 'soNumber customerName');
    if (!ps) throw new ApiError(httpStatus.NOT_FOUND, 'Production sheet not found');
    res.json({ success: true, data: ps });
});

// GET BY SO ID
export const getPSBySOId = asyncHandler(async (req, res) => {
    const ps = await ProductionSheet.findOne({ soId: req.params.soId });
    if (!ps) throw new ApiError(httpStatus.NOT_FOUND, 'Production sheet not found for this SO');
    res.json({ success: true, data: ps });
});

// LIST
export const getPSList = asyncHandler(async (req, res) => {
    const { status, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (req.query.financialYear) filter.financialYear = req.query.financialYear;
    const skip = (Number(page) - 1) * Number(limit);
    const [sheets, total] = await Promise.all([
        ProductionSheet.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
        ProductionSheet.countDocuments(filter),
    ]);
    res.json({ success: true, sheets, total });
});

// UPDATE (testing/packing/loadtest details)
export const updatePS = asyncHandler(async (req, res) => {
    const ps = await ProductionSheet.findById(req.params.id);
    if (!ps) throw new ApiError(httpStatus.NOT_FOUND, 'Production sheet not found');
    Object.assign(ps, req.body);
    ps.updatedBy = req.user.id;
    await ps.save();
    res.json({ success: true, data: ps });
});
