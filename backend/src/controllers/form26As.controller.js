import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { Form26As } from '../models/form26As.model.js';
import { TdsDeduction } from '../models/tdsDeduction.model.js';

export const getImports = asyncHandler(async (req, res) => {
    const { financialYear } = req.query;
    const filter = {};
    if (financialYear) filter.financialYear = financialYear;
    const list = await Form26As.find(filter).sort({ importedAt: -1 }).select('-lines').lean();
    res.send(new ApiResponse(httpStatus.OK, list));
});

export const importData = asyncHandler(async (req, res) => {
    const { financialYear, quarter, pan, lines } = req.body;
    if (!financialYear || !lines?.length) throw new ApiError(httpStatus.BAD_REQUEST, 'financialYear and lines are required');
    const record = await Form26As.create({ financialYear, quarter, pan, lines, createdBy: req.user?._id });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, { _id: record._id, lineCount: lines.length }));
});

export const getLines = asyncHandler(async (req, res) => {
    const record = await Form26As.findById(req.params.id).lean();
    if (!record) throw new ApiError(httpStatus.NOT_FOUND, '26AS record not found');
    res.send(new ApiResponse(httpStatus.OK, record));
});

export const reconcile = asyncHandler(async (req, res) => {
    const record = await Form26As.findById(req.params.id);
    if (!record) throw new ApiError(httpStatus.NOT_FOUND, '26AS record not found');

    const bookDeductions = await TdsDeduction.find({ financialYear: record.financialYear }).lean();

    let matched = 0;
    let unmatched = 0;

    for (const line of record.lines) {
        if (line.matchStatus === 'Ignored') continue;

        // Try to match by section + amount (within 1 rupee tolerance) + deductor TAN
        const match = bookDeductions.find(d => {
            const sectionMatch = d.section?.toUpperCase() === line.section?.toUpperCase();
            const amountMatch = Math.abs(d.tdsAmount - line.tdsDeposited) < 1;
            return sectionMatch && amountMatch;
        });

        if (match) {
            line.matchStatus = 'Matched';
            line.linkedDeductionId = match._id;
            matched++;
        } else {
            line.matchStatus = 'Unmatched';
            unmatched++;
        }
    }

    record.markModified('lines');
    await record.save();

    res.send(new ApiResponse(httpStatus.OK, { matched, unmatched, total: record.lines.length }));
});

export const manualLink = asyncHandler(async (req, res) => {
    const { lineIndex, deductionId } = req.body;
    const record = await Form26As.findById(req.params.id);
    if (!record) throw new ApiError(httpStatus.NOT_FOUND, '26AS record not found');
    if (lineIndex == null || !deductionId) throw new ApiError(httpStatus.BAD_REQUEST, 'lineIndex and deductionId are required');

    record.lines[lineIndex].matchStatus = 'Matched';
    record.lines[lineIndex].linkedDeductionId = deductionId;
    record.markModified('lines');
    await record.save();

    res.send(new ApiResponse(httpStatus.OK, { message: 'Linked successfully' }));
});

export const getReconciliationSummary = asyncHandler(async (req, res) => {
    const { financialYear } = req.query;
    if (!financialYear) throw new ApiError(httpStatus.BAD_REQUEST, 'financialYear is required');

    const records = await Form26As.find({ financialYear }).lean();
    const allLines = records.flatMap(r => r.lines);

    const bookDeductions = await TdsDeduction.find({ financialYear }).lean();

    const totalIn26AS = allLines.reduce((s, l) => s + (l.tdsDeposited || 0), 0);
    const totalInBooks = bookDeductions.reduce((s, d) => s + (d.tdsAmount || 0), 0);
    const matched26AS = allLines.filter(l => l.matchStatus === 'Matched').reduce((s, l) => s + (l.tdsDeposited || 0), 0);
    const unmatched26AS = allLines.filter(l => l.matchStatus === 'Unmatched').reduce((s, l) => s + (l.tdsDeposited || 0), 0);

    res.send(new ApiResponse(httpStatus.OK, {
        financialYear,
        totalIn26AS: +totalIn26AS.toFixed(2),
        totalInBooks: +totalInBooks.toFixed(2),
        difference: +(totalIn26AS - totalInBooks).toFixed(2),
        matched26AS: +matched26AS.toFixed(2),
        unmatched26AS: +unmatched26AS.toFixed(2),
        lineCount: allLines.length,
        bookDeductionCount: bookDeductions.length,
    }));
});
