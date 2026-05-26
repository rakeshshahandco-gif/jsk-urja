import httpStatus from 'http-status';
import * as reconService from '../services/gstReconciliation.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const importPortalData = asyncHandler(async (req, res) => {
    const { records, financialYear, month, source } = req.body;
    if (!records || !financialYear || !month) {
        return res.status(httpStatus.BAD_REQUEST).json(new ApiResponse(httpStatus.BAD_REQUEST, null, 'Missing required fields'));
    }
    const results = await reconService.importGstrData(records, financialYear, month, source || '2B', req.user.id);
    res.json(new ApiResponse(httpStatus.OK, results, 'Data imported successfully'));
});

export const importPortalFile = asyncHandler(async (req, res) => {
    if (!req.file?.buffer) {
        return res.status(httpStatus.BAD_REQUEST).json(new ApiResponse(httpStatus.BAD_REQUEST, null, 'File is required'));
    }
    const { financialYear, month, source } = req.body;
    if (!financialYear || !month) {
        return res.status(httpStatus.BAD_REQUEST).json(new ApiResponse(httpStatus.BAD_REQUEST, null, 'FY and Month are required'));
    }
    const userId = req.user._id || req.user.id;
    const result = await reconService.importGstrFromFile({
        buffer: req.file.buffer,
        fileName: req.file.originalname || 'gstr.json',
        financialYear,
        month,
        source: source || '2B',
        userId,
    });
    res.status(httpStatus.CREATED).json(new ApiResponse(httpStatus.CREATED, result, 'File imported'));
});

export const listImportBatches = asyncHandler(async (req, res) => {
    const data = await reconService.listImportBatches(req.query);
    res.json(new ApiResponse(httpStatus.OK, data));
});

export const getGstinSummary = asyncHandler(async (req, res) => {
    const { financialYear, month, source } = req.query;
    if (!financialYear || !month) {
        return res.status(httpStatus.BAD_REQUEST).json(new ApiResponse(httpStatus.BAD_REQUEST, null, 'FY and Month are required'));
    }
    const data = await reconService.reconcileGstinWise(financialYear, month, source || '2B');
    res.json(new ApiResponse(httpStatus.OK, data));
});

export const getBillToBillDetails = asyncHandler(async (req, res) => {
    const { financialYear, month, source, taxTolerance, taxableTolerance, dateToleranceDays, supplierGstin, rcmOnly } = req.query;
    if (!financialYear || !month) {
        return res.status(httpStatus.BAD_REQUEST).json(new ApiResponse(httpStatus.BAD_REQUEST, null, 'FY and Month are required'));
    }
    const matchConfig = {};
    if (taxTolerance != null) matchConfig.taxTolerance = Number(taxTolerance);
    if (taxableTolerance != null) matchConfig.taxableTolerance = Number(taxableTolerance);
    if (dateToleranceDays != null) matchConfig.dateToleranceDays = Number(dateToleranceDays);

    let data = await reconService.reconcileBillToBill(financialYear, month, source || '2B', matchConfig, {
        persistStatus: req.query.persist !== 'false',
    });

    if (supplierGstin) data = data.filter((d) => d.gstin === supplierGstin);
    if (rcmOnly === 'true') data = data.filter((d) => d.isRcm);

    res.json(new ApiResponse(httpStatus.OK, data));
});

export const getItcSummary = asyncHandler(async (req, res) => {
    const { financialYear, month, source, taxTolerance } = req.query;
    const matchConfig = taxTolerance != null ? { taxTolerance: Number(taxTolerance) } : {};
    const data = await reconService.reconcileBillToBill(financialYear, month, source || '2B', matchConfig, {
        persistStatus: false,
    });

    const summary = {
        itcAsPerBooks: 0,
        itcAsPerPortal: 0,
        matchedItc: 0,
        eligibleItc: 0,
        ineligibleItc: 0,
        booksOnlyItc: 0,
        portalOnlyItc: 0,
        mismatchItc: 0,
    };

    data.forEach((row) => {
        const booksTax = row.books?.totalGst || 0;
        const portalTax = row.portal?.totalGst || 0;
        const portalEligible = row.portal?.itcAvailable !== 'No';

        summary.itcAsPerBooks += booksTax;
        summary.itcAsPerPortal += portalTax;

        if (row.status === 'Fully Matched' || row.status === 'Matched with Rounding') {
            summary.matchedItc += portalTax;
            if (portalEligible) summary.eligibleItc += portalTax;
            else summary.ineligibleItc += portalTax;
        } else if (row.status === 'Books Only') {
            summary.booksOnlyItc += booksTax;
        } else if (row.status === '2B Only') {
            summary.portalOnlyItc += portalTax;
        } else if (row.status === 'Mismatch') {
            summary.mismatchItc += Math.max(booksTax, portalTax);
        }
    });

    res.json(new ApiResponse(httpStatus.OK, summary));
});

export const getRcmSummary = asyncHandler(async (req, res) => {
    const { financialYear, month, source } = req.query;
    if (!financialYear || !month) {
        return res.status(httpStatus.BAD_REQUEST).json(new ApiResponse(httpStatus.BAD_REQUEST, null, 'FY and Month are required'));
    }
    const data = await reconService.getRcmSummary(financialYear, month, source || '2B');
    res.json(new ApiResponse(httpStatus.OK, data));
});

export const manualOverride = asyncHandler(async (req, res) => {
    const { portalId, status, remarks } = req.body;
    if (!portalId || !status) {
        return res.status(httpStatus.BAD_REQUEST).json(new ApiResponse(httpStatus.BAD_REQUEST, null, 'portalId and status required'));
    }
    const userId = req.user._id || req.user.id;
    const doc = await reconService.manualOverrideStatus({ portalId, status, remarks, userId });
    res.json(new ApiResponse(httpStatus.OK, doc));
});
