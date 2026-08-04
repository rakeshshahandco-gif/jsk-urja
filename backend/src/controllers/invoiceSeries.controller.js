import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { PurchaseOrder } from '../models/purchaseOrder.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { GRN } from '../models/grn.model.js';
import { CreditDebitNote } from '../models/creditDebitNote.model.js';
import logger from '../utils/logger.js';
import { getLatestSequenceNumber, formatInvoiceNumber } from '../utils/numberingUtils.js';

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
    const {
        seriesName, financialYear, prefix, startNumber, padLength, gstApplicable,
        isDefault, isDefaultForSalesOrder, isDefaultForTaxInvoice, description,
        isEstimate, documentType,
    } = req.body;
    if (!seriesName || !financialYear || !prefix) throw new ApiError(httpStatus.BAD_REQUEST, 'seriesName, financialYear and prefix are required');

    // If new series is default, unset others
    if (isDefault === true || String(isDefault) === 'true') {
        await InvoiceSeries.updateMany({}, { isDefault: false });
    }
    if (isDefaultForSalesOrder === true || String(isDefaultForSalesOrder) === 'true') {
        await InvoiceSeries.updateMany({}, { isDefaultForSalesOrder: false });
    }
    if (isDefaultForTaxInvoice === true || String(isDefaultForTaxInvoice) === 'true') {
        await InvoiceSeries.updateMany({}, { isDefaultForTaxInvoice: false });
    }

    const estimateFlag = isEstimate === true || String(isEstimate) === 'true' || documentType === 'Estimate';
    const s = await InvoiceSeries.create({
        seriesName,
        financialYear,
        prefix,
        startNumber: startNumber || 1,
        padLength: padLength || 5,
        gstApplicable: estimateFlag
            ? false
            : (String(gstApplicable) === 'true' || gstApplicable === true),
        isEstimate: estimateFlag,
        documentType: estimateFlag ? 'Estimate' : (documentType || ''),
        isDefault: String(isDefault) === 'true' || isDefault === true,
        isDefaultForSalesOrder: String(isDefaultForSalesOrder) === 'true' || isDefaultForSalesOrder === true,
        isDefaultForTaxInvoice: String(isDefaultForTaxInvoice) === 'true' || isDefaultForTaxInvoice === true,
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
    // Per-document-type default exclusivity
    if ((body.isDefaultForSalesOrder === true || String(body.isDefaultForSalesOrder) === 'true') && !s.isDefaultForSalesOrder) {
        await InvoiceSeries.updateMany({ _id: { $ne: id } }, { isDefaultForSalesOrder: false });
    }
    if ((body.isDefaultForTaxInvoice === true || String(body.isDefaultForTaxInvoice) === 'true') && !s.isDefaultForTaxInvoice) {
        await InvoiceSeries.updateMany({ _id: { $ne: id } }, { isDefaultForTaxInvoice: false });
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
    if (body.isDefaultForSalesOrder !== undefined) {
        s.isDefaultForSalesOrder = String(body.isDefaultForSalesOrder) === 'true' || body.isDefaultForSalesOrder === true;
    }
    if (body.isDefaultForTaxInvoice !== undefined) {
        s.isDefaultForTaxInvoice = String(body.isDefaultForTaxInvoice) === 'true' || body.isDefaultForTaxInvoice === true;
    }
    if (body.isActive !== undefined) {
        s.isActive = String(body.isActive) === 'true' || body.isActive === true;
    }

    // Persist Estimate series identity (required for Estimate-only flexible delete).
    if (body.isEstimate !== undefined || body.documentType !== undefined) {
        const wantEstimate = body.isEstimate === true
            || String(body.isEstimate) === 'true'
            || body.documentType === 'Estimate';
        const wantClear = body.isEstimate === false || String(body.isEstimate) === 'false';
        if (wantEstimate) {
            s.isEstimate = true;
            s.documentType = 'Estimate';
            s.gstApplicable = false;
        } else if (wantClear) {
            s.isEstimate = false;
            if (body.documentType !== undefined && body.documentType !== 'Estimate') {
                s.documentType = body.documentType || '';
            } else if (s.documentType === 'Estimate') {
                s.documentType = '';
            }
        } else if (body.documentType !== undefined) {
            s.documentType = body.documentType || '';
        }
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

// PREVIEW NEXT NUMBER — model-aware to support all modules
export const previewNextNumber = asyncHandler(async (req, res) => {
    const s = await InvoiceSeries.findById(req.params.id);
    if (!s || !s.isActive) throw new ApiError(httpStatus.NOT_FOUND, 'Series not found or inactive');

    const financialYear = req.query.financialYear || s.financialYear;
    const modelName = req.query.model || 'SalesInvoice';

    // Map string names to Mongoose models
    const modelMap = {
        'SalesInvoice': SalesInvoice,
        'SalesOrder': SalesOrder,
        'PurchaseOrder': PurchaseOrder,
        'PurchaseInvoice': PurchaseInvoice,
        'GRN': GRN,
        'CreditDebitNote': CreditDebitNote,
    };

    const TargetModel = modelMap[modelName] || SalesInvoice;

    const lastSeq = await getLatestSequenceNumber(TargetModel, s._id, financialYear);
    const nextSeq = Math.max(lastSeq + 1, s.startNumber || 1);
    
    const nextInvoiceNo = formatInvoiceNumber(s.prefix, nextSeq, s.padLength || 2);
    res.json({ success: true, nextInvoiceNo, currentNumber: lastSeq, modelUsed: modelName });
});

