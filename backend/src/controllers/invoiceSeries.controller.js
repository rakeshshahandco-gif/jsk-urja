import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';
import logger from '../utils/logger.js';

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

export const createSeries = asyncHandler(async (req, res) => {
    const { seriesName, financialYear, prefix, startNumber, padLength, gstApplicable, isDefault, description } = req.body;
    if (!seriesName || !financialYear || !prefix) throw new ApiError(httpStatus.BAD_REQUEST, 'seriesName, financialYear and prefix are required');

    // If new series is default, unset others
    if (isDefault === true || String(isDefault) === 'true') {
        await InvoiceSeries.updateMany({}, { isDefault: false });
    }

    const s = await InvoiceSeries.create({
        seriesName,
        financialYear,
        prefix,
        startNumber: startNumber || 1,
        padLength: padLength || 5,
        gstApplicable: String(gstApplicable) === 'true' || gstApplicable === true,
        isDefault: String(isDefault) === 'true' || isDefault === true,
        description: description || '',
        isActive: true,
        createdBy: req.user.id,
    });
    res.status(httpStatus.CREATED).json({ success: true, data: s });
});

export const updateSeries = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body;

    logger.info(`DEBUG_BODY: UpdateSeries ID: ${id}, Body keys: ${Object.keys(body).join(', ')}`);
    logger.info(`DEBUG_VAL: gstApplicable from body: ${body.gstApplicable} (${typeof body.gstApplicable})`);

    const s = await InvoiceSeries.findById(id);
    if (!s) throw new ApiError(httpStatus.NOT_FOUND, 'Series not found');

    // Unset defaults if this one is becoming default
    if (body.isDefault === true && !s.isDefault) {
        await InvoiceSeries.updateMany({ _id: { $ne: id } }, { isDefault: false });
    }

    // Manually update fields
    if (body.seriesName !== undefined) s.seriesName = body.seriesName;
    if (body.financialYear !== undefined) s.financialYear = body.financialYear;
    if (body.prefix !== undefined) s.prefix = body.prefix;
    if (body.startNumber !== undefined) s.startNumber = Number(body.startNumber);
    if (body.padLength !== undefined) s.padLength = Number(body.padLength);

    if (body.resetSequence === true || String(body.resetSequence) === 'true') {
        s.currentNumber = 0;
    }

    // Explicitly handle booleans
    if (body.gstApplicable !== undefined) {
        s.gstApplicable = String(body.gstApplicable) === 'true' || body.gstApplicable === true;
    }
    if (body.isDefault !== undefined) {
        s.isDefault = String(body.isDefault) === 'true' || body.isDefault === true;
    }
    if (body.isActive !== undefined) {
        s.isActive = String(body.isActive) === 'true' || body.isActive === true;
    }

    if (body.description !== undefined) s.description = body.description;

    logger.info(`DEBUG_BEFORE_SAVE: ${s.seriesName} gstApplicable: ${s.gstApplicable}`);
    await s.save();
    logger.info(`DEBUG_AFTER_SAVE: ${s.seriesName} gstApplicable: ${s.gstApplicable}`);

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

// PREVIEW NEXT NUMBER — same self-healing sync as createSalesInvoice
export const previewNextNumber = asyncHandler(async (req, res) => {
    const s = await InvoiceSeries.findById(req.params.id);
    if (!s || !s.isActive) throw new ApiError(httpStatus.NOT_FOUND, 'Series not found or inactive');

    // Import SalesInvoice inline to avoid circular deps
    const { SalesInvoice } = await import('../models/salesInvoice.model.js');
    const lastActual = await SalesInvoice.findOne({
        invoiceNumber: { $regex: `^${s.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` }
    }).sort({ invoiceNumber: -1 });

    let syncedCurrent = s.currentNumber;
    if (lastActual) {
        const lastNum = parseInt(lastActual.invoiceNumber.replace(s.prefix, ''), 10);
        if (!isNaN(lastNum) && lastNum < syncedCurrent) {
            syncedCurrent = lastNum;
        }
    }

    const next = Math.max(syncedCurrent + 1, s.startNumber || 1);
    const nextInvoiceNo = `${s.prefix}${String(next).padStart(s.padLength || 5, '0')}`;
    res.json({ success: true, nextInvoiceNo, currentNumber: syncedCurrent });
});

