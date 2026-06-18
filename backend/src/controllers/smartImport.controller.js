import fs from 'fs';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { SmartImportBatch } from '../models/smartImportBatch.model.js';
import { uploadSmartImport, approveSmartImportBatch } from '../services/smartImport/smartImport.service.js';

const IMPORT_TYPES = ['tally_ledger_master', 'tally_day_book', 'gstr2b_itc'];

export const uploadImport = asyncHandler(async (req, res) => {
    const importType = String(req.body.importType || '');
    if (!IMPORT_TYPES.includes(importType)) throw new ApiError(400, 'Invalid importType');
    const financialYear = req.body.financialYear;
    if (!financialYear) throw new ApiError(400, 'financialYear is required');

    let buffer;
    if (req.file?.path) {
        buffer = fs.readFileSync(req.file.path);
    } else if (req.file?.buffer) {
        buffer = req.file.buffer;
    } else {
        throw new ApiError(400, 'File is required');
    }

    const result = await uploadSmartImport({
        buffer,
        fileName: req.file.originalname || 'import.xlsx',
        importType,
        financialYear,
        userId: req.user.id,
        companyId: req.companyId,
        dryRun: req.body.dryRun === true || req.body.dryRun === 'true',
    });
    const msg = result?.batch?.dryRun
        ? 'Dry run — preview only, nothing posted'
        : 'Import validated — review before posting';
    res.send(new ApiResponse(201, result, msg));
});

export const getBatch = asyncHandler(async (req, res) => {
    const batch = await SmartImportBatch.findById(req.params.batchId).lean();
    if (!batch) throw new ApiError(404, 'Batch not found');
    res.send(new ApiResponse(200, batch));
});

export const listBatches = asyncHandler(async (req, res) => {
    const { importType, financialYear, status, limit = 20 } = req.query;
    const q = {};
    if (importType) q.importType = importType;
    if (financialYear) q.financialYear = financialYear;
    if (status) q.status = status;
    const batches = await SmartImportBatch.find(q).sort({ createdAt: -1 }).limit(Number(limit)).lean();
    res.send(new ApiResponse(200, { results: batches }));
});

export const approveBatch = asyncHandler(async (req, res) => {
    const rowNumbers = Array.isArray(req.body.rowNumbers) ? req.body.rowNumbers : undefined;
    const result = await approveSmartImportBatch(req.params.batchId, rowNumbers, req.user.id);
    res.send(new ApiResponse(200, result, 'Import batch posted'));
});
