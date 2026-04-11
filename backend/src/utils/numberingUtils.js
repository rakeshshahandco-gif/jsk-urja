import { SalesInvoice } from '../models/salesInvoice.model.js';
import { InvoiceSeries } from '../models/invoiceSeries.model.js';
import { getShortFY } from './fyUtils.js';
import mongoose from 'mongoose';

/**
 * Format an invoice number based on prefix, sequence, and padding
 */
export const formatInvoiceNumber = (prefix, sequence, padLength = 2) => {
    const padded = String(sequence).padStart(padLength, '0');
    return `${prefix}${padded}`;
};

/**
 * Get the latest sequence number for a series and financial year
 */
export const getLatestSequenceNumber = async (seriesId, financialYear, session = null) => {
    const lastInvoice = await SalesInvoice.findOne({ seriesId, financialYear, isDeleted: { $ne: true } })
        .sort({ sequenceNumber: -1 })
        .session(session)
        .select('sequenceNumber');
    
    return lastInvoice ? (lastInvoice.sequenceNumber || 0) : 0;
};

/**
 * Generate the next number for a given series and increment it
 * Returns an object with { sequenceNumber, displayInvoiceNumber }
 * @param {string} seriesId 
 * @param {string} financialYear 
 * @param {ClientSession} session 
 */
export const getNextNumberFromSeries = async (seriesId, financialYear, session = null) => {
    const series = await InvoiceSeries.findById(seriesId).session(session);
    if (!series) return null;

    // Use DB to find the absolute max used sequence number to avoid gaps/duplicates if currentNumber is out of sync
    const lastSeq = await getLatestSequenceNumber(seriesId, financialYear, session);
    const nextSeq = Math.max(lastSeq + 1, series.startNumber);
    
    const displayInvoiceNumber = formatInvoiceNumber(series.prefix, nextSeq, series.padLength || 2);
    
    // Update series currentNumber for tracking
    series.currentNumber = nextSeq;
    await series.save({ session });
    
    return {
        sequenceNumber: nextSeq,
        displayInvoiceNumber
    };
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
    const lastInvoice = await SalesInvoice.findOne({ 
        seriesId, 
        isDeleted: { $ne: true } 
    }).sort({ sequenceNumber: -1 }).session(session).select('sequenceNumber');

    if (!lastInvoice) {
        series.currentNumber = Math.max(0, (series.startNumber || 1) - 1);
    } else {
        series.currentNumber = lastInvoice.sequenceNumber || 0;
    }

    await series.save({ session });
    return series.currentNumber;
};

/**
 * Extract sequence number from a formatted invoice number
 */
export const extractSequenceNumber = (prefix, displayNumber) => {
    if (!displayNumber) return 0;
    // Replace prefix (e.g. "JU/SALES/26-27/") with empty string
    const seqStr = displayNumber.replace(prefix, '');
    const seq = parseInt(seqStr, 10);
    return isNaN(seq) ? 0 : seq;
};
