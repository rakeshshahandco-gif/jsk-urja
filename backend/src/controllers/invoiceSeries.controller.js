import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';

// LIST
export const getSeries = asyncHandler(async (req, res) => {
    const series = await InvoiceSeries.find({ isActive: req.query.active !== 'false' }).sort({ financialYear: -1 });
    res.json({ success: true, series });
});

// GET BY ID
export const getSeriesById = asyncHandler(async (req, res) => {
    const s = await InvoiceSeries.findById(req.params.id);
    if (!s) throw new ApiError(httpStatus.NOT_FOUND, 'Series not found');
    res.json({ success: true, data: s });
});

// CREATE
export const createSeries = asyncHandler(async (req, res) => {
    const { seriesName, financialYear, prefix, startNumber, padLength, isDefault, description } = req.body;
    if (!seriesName || !financialYear || !prefix) throw new ApiError(httpStatus.BAD_REQUEST, 'seriesName, financialYear and prefix are required');

    // If new series is default, unset others
    if (isDefault) await InvoiceSeries.updateMany({}, { isDefault: false });

    const s = await InvoiceSeries.create({
        seriesName, financialYear, prefix, startNumber: startNumber || 1,
        padLength: padLength || 5, isDefault: isDefault || false,
        description: description || '', isActive: true,
        createdBy: req.user.id,
    });
    res.status(httpStatus.CREATED).json({ success: true, data: s });
});

// UPDATE
export const updateSeries = asyncHandler(async (req, res) => {
    const s = await InvoiceSeries.findById(req.params.id);
    if (!s) throw new ApiError(httpStatus.NOT_FOUND, 'Series not found');
    if (req.body.isDefault) await InvoiceSeries.updateMany({ _id: { $ne: s._id } }, { isDefault: false });
    Object.assign(s, req.body);
    await s.save();
    res.json({ success: true, data: s });
});

// DELETE
export const deleteSeries = asyncHandler(async (req, res) => {
    const s = await InvoiceSeries.findById(req.params.id);
    if (!s) throw new ApiError(httpStatus.NOT_FOUND, 'Series not found');
    if (s.currentNumber > 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete a series that has been used');
    await InvoiceSeries.deleteOne({ _id: s._id });
    res.json({ success: true, message: 'Deleted' });
});
