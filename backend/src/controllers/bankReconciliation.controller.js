import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import * as brService from '../services/bankReconciliation/bankReconciliation.service.js';
import * as reports from '../services/bankReconciliation/reports.service.js';

export const uploadImport = asyncHandler(async (req, res) => {
    if (!req.file?.buffer) throw new ApiError(httpStatus.BAD_REQUEST, 'File is required');
    const { cashBankAccountId, financialYear, skipDuplicateRows } = req.body;
    if (!cashBankAccountId) throw new ApiError(httpStatus.BAD_REQUEST, 'cashBankAccountId is required');

    const userId = req.user._id || req.user.id;
    const result = await brService.importStatement({
        buffer: req.file.buffer,
        fileName: req.file.originalname || 'statement.csv',
        cashBankAccountId,
        financialYear,
        userId,
        skipDuplicateRows: skipDuplicateRows === 'true' || skipDuplicateRows === true,
    });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, result, 'Import completed'));
});

export const listImports = asyncHandler(async (req, res) => {
    const { cashBankAccountId, limit } = req.query;
    const data = await brService.listImports({
        cashBankAccountId,
        limit: Number(limit) || 50,
    });
    res.send(new ApiResponse(httpStatus.OK, data));
});

export const deleteImport = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const data = await brService.deleteImportBatch(req.params.importId, userId);
    res.send(new ApiResponse(httpStatus.OK, data));
});

export const getWorkspace = asyncHandler(async (req, res) => {
    const { cashBankAccountId, importId, from, to, financialYear } = req.query;
    if (!cashBankAccountId) throw new ApiError(httpStatus.BAD_REQUEST, 'cashBankAccountId is required');

    const matchConfig = buildMatchConfig(req.query);
    const data = await brService.getWorkspace({
        cashBankAccountId,
        importId,
        from,
        to,
        financialYear,
        matchConfig,
    });
    res.send(new ApiResponse(httpStatus.OK, data));
});

export const runMatching = asyncHandler(async (req, res) => {
    const { cashBankAccountId, importId, from, to, financialYear } = req.body;
    if (!cashBankAccountId) throw new ApiError(httpStatus.BAD_REQUEST, 'cashBankAccountId is required');
    const userId = req.user._id || req.user.id;
    const matchConfig = buildMatchConfig(req.body);
    const data = await brService.runMatching({
        cashBankAccountId,
        importId,
        from,
        to,
        financialYear,
        matchConfig,
        userId,
    });
    res.send(new ApiResponse(httpStatus.OK, data));
});

function buildMatchConfig(src) {
    const matchConfig = {};
    if (src.dateTolerancePreset) matchConfig.dateTolerancePreset = src.dateTolerancePreset;
    if (src.dateToleranceDays != null) matchConfig.dateToleranceDays = Number(src.dateToleranceDays);
    if (src.autoThreshold != null) matchConfig.autoThreshold = Number(src.autoThreshold);
    if (src.possibleThreshold != null) matchConfig.possibleThreshold = Number(src.possibleThreshold);
    return matchConfig;
}

export const approveMatches = asyncHandler(async (req, res) => {
    const { pairs, remarks, groupId } = req.body;
    if (!Array.isArray(pairs) || !pairs.length) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'pairs[] is required');
    }
    const userId = req.user._id || req.user.id;
    const created = await brService.approveMatches({ pairs, userId, remarks, groupId });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, { count: created.length, reconciliations: created }));
});

export const approveCombo = asyncHandler(async (req, res) => {
    const { bankLineId, allocations, remarks, confidence } = req.body;
    if (!bankLineId || !Array.isArray(allocations) || !allocations.length) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'bankLineId and allocations[] are required');
    }
    const userId = req.user._id || req.user.id;
    const created = await brService.approveComboMatch({ bankLineId, allocations, userId, remarks, confidence });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, { count: created.length, reconciliations: created }));
});

export const manualLink = asyncHandler(async (req, res) => {
    const { bankLineId, bookRefId, remarks, confidence, allocatedAmount } = req.body;
    if (!bankLineId || !bookRefId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'bankLineId and bookRefId are required');
    }
    const userId = req.user._id || req.user.id;
    const created = await brService.manualLink({ bankLineId, bookRefId, userId, remarks, confidence, allocatedAmount });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, created));
});

export const rejectMatch = asyncHandler(async (req, res) => {
    const { bankLineId } = req.body;
    if (!bankLineId) throw new ApiError(httpStatus.BAD_REQUEST, 'bankLineId is required');
    const userId = req.user._id || req.user.id;
    const line = await brService.rejectSuggestion({ bankLineId, userId });
    res.send(new ApiResponse(httpStatus.OK, line));
});

export const ignoreLine = asyncHandler(async (req, res) => {
    const { bankLineId } = req.body;
    if (!bankLineId) throw new ApiError(httpStatus.BAD_REQUEST, 'bankLineId is required');
    const userId = req.user._id || req.user.id;
    const line = await brService.ignoreBankLine(bankLineId, userId);
    res.send(new ApiResponse(httpStatus.OK, line));
});

export const markBankCharge = asyncHandler(async (req, res) => {
    const { bankLineId } = req.body;
    if (!bankLineId) throw new ApiError(httpStatus.BAD_REQUEST, 'bankLineId is required');
    const userId = req.user._id || req.user.id;
    const line = await brService.markBankCharge(bankLineId, userId);
    res.send(new ApiResponse(httpStatus.OK, line));
});

export const undoReconciliation = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id;
    const reason = req.body?.reason || '';
    const rec = await brService.undoReconciliation(req.params.id, userId, reason);
    res.send(new ApiResponse(httpStatus.OK, rec));
});

export const getImportLines = asyncHandler(async (req, res) => {
    const { page, limit, matchStatus } = req.query;
    const data = await brService.listImportLines(req.params.importId, {
        page: Number(page) || 1,
        limit: Number(limit) || 100,
        matchStatus,
    });
    res.send(new ApiResponse(httpStatus.OK, data));
});

export const listReconciled = asyncHandler(async (req, res) => {
    const data = await brService.listReconciled(req.query);
    res.send(new ApiResponse(httpStatus.OK, data));
});

export const reportSummary = asyncHandler(async (req, res) => {
    const data = await reports.reportSummary(req.query);
    res.send(new ApiResponse(httpStatus.OK, data));
});

export const reportUnreconciled = asyncHandler(async (req, res) => {
    const data = await reports.reportUnreconciled(req.query);
    res.send(new ApiResponse(httpStatus.OK, data));
});

export const reportBookVsBank = asyncHandler(async (req, res) => {
    const { cashBankAccountId } = req.query;
    if (!cashBankAccountId) throw new ApiError(httpStatus.BAD_REQUEST, 'cashBankAccountId is required');
    const data = await reports.reportBookVsBankBalance(req.query);
    res.send(new ApiResponse(httpStatus.OK, data));
});

export const reportClearedPending = asyncHandler(async (req, res) => {
    const data = await reports.reportClearedVsPending(req.query);
    res.send(new ApiResponse(httpStatus.OK, data));
});

export const reportDateWise = asyncHandler(async (req, res) => {
    const data = await reports.reportDateWise(req.query);
    res.send(new ApiResponse(httpStatus.OK, data));
});

export const reportManual = asyncHandler(async (req, res) => {
    const data = await reports.reportManualAdjustments(req.query);
    res.send(new ApiResponse(httpStatus.OK, data));
});

export const reportCharges = asyncHandler(async (req, res) => {
    const data = await reports.reportBankCharges(req.query);
    res.send(new ApiResponse(httpStatus.OK, data));
});

export const reportReconciliationStatement = asyncHandler(async (req, res) => {
    const data = await reports.reportReconciliationStatement(req.query);
    res.send(new ApiResponse(httpStatus.OK, data));
});

export const reportImportHistory = asyncHandler(async (req, res) => {
    const data = await reports.reportImportHistory(req.query);
    res.send(new ApiResponse(httpStatus.OK, data));
});
