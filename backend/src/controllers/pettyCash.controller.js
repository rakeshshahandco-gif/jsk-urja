import pick from '../utils/pick.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as pettyCashService from '../services/pettyCash.service.js';
import * as voucherAttachmentService from '../services/voucherAttachment.service.js';

export const getSettings = asyncHandler(async (req, res) => {
    const financialYear = req.query.financialYear;
    if (!financialYear) throw new ApiError(400, 'financialYear query is required');
    const doc = await pettyCashService.getSettings(financialYear);
    res.send(new ApiResponse(200, doc));
});

export const saveSettings = asyncHandler(async (req, res) => {
    const financialYear = req.body.financialYear || req.query.financialYear;
    if (!financialYear) throw new ApiError(400, 'financialYear is required');
    const doc = await pettyCashService.saveSettings(financialYear, req.body, req.user.id);
    res.send(new ApiResponse(200, doc, 'Petty cash settings saved'));
});

export const listLedgers = asyncHandler(async (req, res) => {
    const ledgers = await pettyCashService.getExpenseIncomeLedgers();
    res.send(new ApiResponse(200, { results: ledgers }));
});

export const downloadTemplate = asyncHandler(async (req, res) => {
    const financialYear = req.query.financialYear;
    if (!financialYear) throw new ApiError(400, 'financialYear query is required');
    const buffer = await pettyCashService.generateTemplateBuffer(financialYear);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="petty-cash-template-${financialYear}.xlsx"`);
    res.send(Buffer.from(buffer));
});

export const exportExpenseLedgers = asyncHandler(async (req, res) => {
    const buffer = await pettyCashService.generateExpenseLedgersExportBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="expense-ledgers.xlsx"');
    res.send(Buffer.from(buffer));
});

export const listEntries = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['financialYear', 'status', 'entryKind', 'ledgerId', 'createdBy', 'fromDate', 'toDate', 'search']);
    const options = pick(req.query, ['page', 'limit']);
    const result = await pettyCashService.queryEntries(filter, options);
    res.send(new ApiResponse(200, result));
});

export const getEntry = asyncHandler(async (req, res) => {
    const doc = await pettyCashService.getEntryById(req.params.id);
    res.send(new ApiResponse(200, doc));
});

export const createEntry = asyncHandler(async (req, res) => {
    const doc = await pettyCashService.createEntry(req.body, req.user.id, { postNow: req.body.postNow !== false });
    res.status(201).send(new ApiResponse(201, doc, 'Petty cash entry saved'));
});

export const uploadImport = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No file uploaded');
    const financialYear = req.body.financialYear || req.query.financialYear;
    if (!financialYear) throw new ApiError(400, 'financialYear is required');
    const result = await pettyCashService.parseAndValidateImport(
        req.file.buffer,
        req.file.originalname,
        financialYear,
        req.user.id,
    );
    res.send(new ApiResponse(200, result, 'Import validated — review preview before approve'));
});

export const approveImport = asyncHandler(async (req, res) => {
    const result = await pettyCashService.approveImportBatch(req.params.batchId, req.user.id, {
        rowNumbers: req.body.rowNumbers,
    });
    res.send(new ApiResponse(200, result, 'Import posted'));
});

export const getReport = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['financialYear', 'reportType', 'entryKind', 'ledgerId', 'createdBy', 'fromDate', 'toDate']);
    const result = await pettyCashService.getReport(filter);
    res.send(new ApiResponse(200, result));
});

export const exportReport = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['financialYear', 'reportType', 'entryKind', 'ledgerId', 'createdBy', 'fromDate', 'toDate']);
    const buffer = await pettyCashService.exportReportExcel(filter);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="petty-cash-report.xlsx"');
    res.send(Buffer.from(buffer));
});

export const recalculateBalances = asyncHandler(async (req, res) => {
    const financialYear = req.body.financialYear || req.query.financialYear;
    if (!financialYear) throw new ApiError(400, 'financialYear is required');
    const result = await pettyCashService.computeRunningBalances(financialYear);
    res.send(new ApiResponse(200, result, 'Balances recalculated'));
});

export const attachFile = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No file uploaded');
    await pettyCashService.getEntryById(req.params.id);
    const doc = await voucherAttachmentService.uploadAttachment(
        { voucherType: 'petty_cash', voucherId: req.params.id, source: 'upload', label: req.body.label || '' },
        req.file,
        req.user.id,
    );
    res.status(201).send(new ApiResponse(201, doc, 'Attachment uploaded'));
});
