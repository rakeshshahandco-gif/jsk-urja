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
 * Get the latest sequence number for a series and financial year from a specific model
 */
export const getLatestSequenceNumber = async (TargetModel, seriesId, financialYear, session = null) => {
    const lastDoc = await TargetModel.findOne({ seriesId, financialYear, isDeleted: { $ne: true } })
        .sort({ sequenceNumber: -1 })
        .session(session)
        .select('sequenceNumber');
    
    return lastDoc ? (lastDoc.sequenceNumber || 0) : 0;
};

/**
 * Generate the next number for a given series and increment it
 * Returns an object with { sequenceNumber, displayInvoiceNumber }
 * @param {mongoose.Model} TargetModel - The Mongoose model to check against
 * @param {string} seriesId 
 * @param {string} financialYear 
 * @param {ClientSession} session 
 */
export const getNextNumberFromSeries = async (TargetModel, seriesId, financialYear, session = null, numberField = 'invoiceNumber') => {
    const series = await InvoiceSeries.findById(seriesId).session(session);
    if (!series) return null;

    // Use DB to find the absolute max used sequence number to avoid gaps/duplicates if currentNumber is out of sync
    let lastSeq = await getLatestSequenceNumber(TargetModel, seriesId, financialYear, session);
    let nextSeq = Math.max(lastSeq + 1, series.startNumber);
    
    let displayInvoiceNumber = formatInvoiceNumber(series.prefix, nextSeq, series.padLength || 2);
    
    // Resilience Loop: Ensure the generated sequence number DOES NOT already exist in the database
    // This handles cases where manual entries or out-of-sync series state might cause collisions.
    let isDuplicate = true;
    let attempts = 0;
    const MAX_ATTEMPTS = 100;

    while (isDuplicate && attempts < MAX_ATTEMPTS) {
        // Double check: both by sequence number AND by the final formatted string
        // Only ACTIVE and CANCELLED invoices block numbers; DELETED must not block reuse.
        const blockingFilter = { isDeleted: { $ne: true } };
        const [seqExists, strExists] = await Promise.all([
            TargetModel.exists({ seriesId, sequenceNumber: nextSeq, ...blockingFilter }).session(session),
            TargetModel.exists({ [numberField]: displayInvoiceNumber, ...blockingFilter }).session(session)
        ]);
        
        if (seqExists || strExists) {
            nextSeq++;
            displayInvoiceNumber = formatInvoiceNumber(series.prefix, nextSeq, series.padLength || 2);
            attempts++;
        } else {
            isDuplicate = false;
        }
    }

    
    // Update series currentNumber for tracking (internal purpose)
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
 * Re-scan all surviving docs in a series to reset the currentNumber.
 * This is used after administrative cleanup/deletions.
 * @param {mongoose.Model} TargetModel
 * @param {string} seriesId 
 * @param {ClientSession} session 
 */
export const recomputeSeriesState = async (TargetModel, seriesId, session = null) => {
    const series = await InvoiceSeries.findById(seriesId).session(session);
    if (!series) return;

    // Find all non-deleted docs in this series
    const lastDoc = await TargetModel.findOne({ 
        seriesId, 
        isDeleted: { $ne: true } 
    }).sort({ sequenceNumber: -1 }).session(session).select('sequenceNumber');

    if (!lastDoc) {
        series.currentNumber = Math.max(0, (series.startNumber || 1) - 1);
    } else {
        series.currentNumber = lastDoc.sequenceNumber || 0;
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

/**
 * Robust sequence generator for simple prefixed service documents (JC-, CMP-, etc.)
 * @param {mongoose.Model} Model
 * @param {string} prefix e.g. "JC-"
 * @param {string} fieldName e.g. "jobCardNo"
 */
export const generateServiceSequence = async (Model, prefix, fieldName) => {
    // Find the doc with the highest alphanumeric value for this field
    // Since we pad with zeros (e.g. JC-0001), string sorting works up to 9999
    const lastDoc = await Model.findOne({}, { [fieldName]: 1 }, { sort: { [fieldName]: -1 } });
    
    let nextNum = 1;
    if (lastDoc && lastDoc[fieldName]) {
        const parts = lastDoc[fieldName].split('-');
        if (parts.length > 1) {
            const lastNum = parseInt(parts[1], 10);
            if (!isNaN(lastNum)) nextNum = lastNum + 1;
        }
    }
    
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
};
