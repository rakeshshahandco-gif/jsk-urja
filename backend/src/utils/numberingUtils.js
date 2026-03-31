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
