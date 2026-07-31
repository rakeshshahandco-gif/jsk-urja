import multer from 'multer';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    commitFileImport,
    commitManualUrlImport,
    commitPastedTextImport,
    getImportRun,
    listImportRuns,
    previewFileImport,
    previewManualUrlImport,
    previewPastedTextImport,
} from '../services/dataExtractor/searchCampaign/rawCaptureImport/import.orchestration.service.js';
import {
    IMPORT_CSV_MAX_BYTES,
    IMPORT_IDEMPOTENCY_REUSED_CODE,
    IMPORT_XLSX_MAX_BYTES,
} from '../services/dataExtractor/searchCampaign/rawCaptureImport/constants.js';

function requireCompanyContext(req) {
    if (!req.companyId) throw new ApiError(400, 'Company context required');
    return req.companyId;
}

function sendSafeError(res, err) {
    if (err && err.errorCode === IMPORT_IDEMPOTENCY_REUSED_CODE) {
        res.status(409).send({
            success: false,
            code: 409,
            errorCode: IMPORT_IDEMPOTENCY_REUSED_CODE,
            message: err.message,
        });
        return;
    }
    const status = Number(err?.statusCode) || 500;
    const operational = Boolean(err?.isOperational) || status < 500;
    res.status(status).send({
        success: false,
        code: status,
        message: operational ? String(err?.message || 'Request failed').slice(0, 500) : 'Request failed',
    });
}

function withSafeErrors(handler) {
    return asyncHandler(async (req, res) => {
        try {
            await handler(req, res);
        } catch (err) {
            sendSafeError(res, err);
        }
    });
}

/** Instrumentation: proves Multer was/wasn't entered. */
export const __multerInvokes = { count: 0 };
export function __resetMulterInvokes() { __multerInvokes.count = 0; }

/** Route-specific memory upload: one file, bounded size. */
export const rawCaptureImportUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: Math.max(IMPORT_CSV_MAX_BYTES, IMPORT_XLSX_MAX_BYTES),
        files: 1,
        fields: 20,
    },
    fileFilter: (req, file, cb) => {
        if (file.fieldname !== 'file') {
            cb(new ApiError(400, 'Unexpected file field'));
            return;
        }
        const name = String(file.originalname || '').toLowerCase();
        if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) {
            cb(new ApiError(400, 'Only .csv or .xlsx files are allowed'));
            return;
        }
        cb(null, true);
    },
});

export function multerSingleFile(req, res, next) {
    __multerInvokes.count += 1;
    rawCaptureImportUpload.single('file')(req, res, (err) => {
        if (!err) return next();
        const message = err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
            || /Too many files/i.test(err.message || '')
            ? 'Only one file is allowed'
            : (err.message || 'Upload failed');
        const status = err instanceof ApiError ? err.statusCode : 400;
        res.status(status).send({ success: false, code: status, message: String(message).slice(0, 300) });
    });
}

export const previewManualUrls = withSafeErrors(async (req, res) => {
    const data = await previewManualUrlImport({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        body: req.body,
    });
    res.send(new ApiResponse(200, data, 'Manual URL preview'));
});

export const previewPastedText = withSafeErrors(async (req, res) => {
    const data = await previewPastedTextImport({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        body: req.body,
    });
    res.send(new ApiResponse(200, data, 'Pasted text preview'));
});

export const previewFile = withSafeErrors(async (req, res) => {
    if (req.files && Array.isArray(req.files) && req.files.length > 1) {
        throw new ApiError(400, 'Only one file is allowed');
    }
    const data = await previewFileImport({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        body: req.body,
        file: req.file,
    });
    res.send(new ApiResponse(200, data, 'File preview'));
});

export const ingestManualUrls = withSafeErrors(async (req, res) => {
    const data = await commitManualUrlImport({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        body: req.body,
    });
    const code = data.idempotentReplay ? 200 : 201;
    res.status(code).send(new ApiResponse(code, data, data.idempotentReplay ? 'Import replay' : 'Import committed'));
});

export const ingestPastedText = withSafeErrors(async (req, res) => {
    const data = await commitPastedTextImport({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        body: req.body,
    });
    const code = data.idempotentReplay ? 200 : 201;
    res.status(code).send(new ApiResponse(code, data, data.idempotentReplay ? 'Import replay' : 'Import committed'));
});

export const ingestFile = withSafeErrors(async (req, res) => {
    if (req.files && Array.isArray(req.files) && req.files.length > 1) {
        throw new ApiError(400, 'Only one file is allowed');
    }
    const data = await commitFileImport({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        body: req.body,
        file: req.file,
    });
    const code = data.idempotentReplay ? 200 : 201;
    res.status(code).send(new ApiResponse(code, data, data.idempotentReplay ? 'Import replay' : 'Import committed'));
});

export const getOne = withSafeErrors(async (req, res) => {
    const data = await getImportRun({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        importRunId: req.params.importRunId,
    });
    res.send(new ApiResponse(200, data, 'Import run'));
});

export const list = withSafeErrors(async (req, res) => {
    const data = await listImportRuns({
        companyId: requireCompanyContext(req),
        user: req.user,
        campaignId: req.params.campaignId,
        query: req.query,
    });
    res.send(new ApiResponse(200, data, 'Import runs'));
});
