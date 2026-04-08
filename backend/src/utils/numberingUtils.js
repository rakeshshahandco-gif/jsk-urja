import { SalesInvoice } from '../models/salesInvoice.model.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';
import { getShortFY } from './fyUtils.js';
import mongoose from 'mongoose';

/**
 * Generate the next number for a given series and increment it
 * @param {string} seriesId 
 * @param {ClientSession} session 
 * @returns {Promise<string>}
 */
export const getNextNumberFromSeries = async (seriesId, session = null) => {
    const series = await InvoiceSeries.findById(seriesId).session(session);
    if (!series) return null;

    const nextNumber = series.nextInvoiceNumber();
    series.currentNumber = Math.max(series.currentNumber + 1, series.startNumber);
    await series.save({ session });
    
    return nextNumber;
};

/**
 * Find the default series for a given Financial Year
 * @param {string} fy e.g. "2025-2026"
 * @returns {Promise<InvoiceSeries>}
 */
export const getDefaultSeriesForFY = async (fy) => {
    const shortFY = getShortFY(fy);
    // Try to find series matching the short FY or full FY
    let series = await InvoiceSeries.findOne({ 
        financialYear: shortFY,
        isDefault: true,
        isActive: true
    });

    if (!series) {
        series = await InvoiceSeries.findOne({ 
            financialYear: fy,
            isDefault: true,
            isActive: true
        });
    }

    return series;
};

/**
 * Re-scan all surviving invoices in a series to reset the currentNumber.
 * This is used after administrative cleanup/deletions.
 * @param {string} seriesId 
 * @param {ClientSession} session 
 */
export const recomputeSeriesState = async (seriesId, session = null) => {
    const series = await InvoiceSeries.findById(seriesId).session(session);
    if (!series) return;

    // Find all non-deleted invoices in this series
    const invoices = await SalesInvoice.find({ 
        seriesId, 
        isDeleted: { $ne: true } 
    }).session(session).select('invoiceNumber');

    if (invoices.length === 0) {
        series.currentNumber = Math.max(0, (series.startNumber || 1) - 1);
    } else {
        let maxNum = 0;
        invoices.forEach(inv => {
            const numStr = inv.invoiceNumber.slice(series.prefix.length);
            const num = parseInt(numStr, 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
        });
        series.currentNumber = maxNum;
    }

    await series.save({ session });
    return series.currentNumber;
};
