import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as textileJobWorkRateService from '../services/textileJobWorkRate.service.js';

export const getEligibility = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    const data = await textileJobWorkRateService.assertTextileJobWorkAccess(companyId);
    res.json({
        success: true,
        data: {
            eligible: true,
            companyId: data.company._id,
            companyName: data.company.companyName,
            templateCode: data.template?.templateCode,
        },
    });
});

export const getMeta = asyncHandler(async (req, res) => {
    res.json({ success: true, data: textileJobWorkRateService.getTextileJobWorkMeta() });
});

export const listRates = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    const data = await textileJobWorkRateService.listTextileJobWorkRates(companyId, req.query);
    res.json({ success: true, data });
});

export const lookupRate = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    const data = await textileJobWorkRateService.lookupTextileJobWorkRate(companyId, {
        processName: req.query.processName,
        vendorWorker: req.query.vendorWorker,
        fabricType: req.query.fabricType,
    });
    res.json({ success: true, data });
});

export const createRate = asyncHandler(async (req, res) => {
    const companyId = req.body.companyId || req.companyId;
    const data = await textileJobWorkRateService.createTextileJobWorkRate(
        companyId,
        req.body,
        req.user?.id || req.user?._id,
    );
    res.status(httpStatus.CREATED).json({ success: true, data });
});

export const updateRate = asyncHandler(async (req, res) => {
    const companyId = req.body.companyId || req.companyId;
    const data = await textileJobWorkRateService.updateTextileJobWorkRate(
        req.params.id,
        companyId,
        req.body,
        req.user?.id || req.user?._id,
    );
    res.json({ success: true, data });
});

export const removeRate = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    await textileJobWorkRateService.deleteTextileJobWorkRate(req.params.id, companyId);
    res.json({ success: true, message: 'Rate deactivated' });
});

export const vendorRateReport = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    const data = await textileJobWorkRateService.getVendorRateListReport(companyId);
    res.json({ success: true, data });
});

export const workerRateReport = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    const data = await textileJobWorkRateService.getWorkerRateListReport(companyId);
    res.json({ success: true, data });
});

export const processCostSummary = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    const data = await textileJobWorkRateService.getProcessCostSummaryReport(companyId, {
        fromDate: req.query.fromDate,
        toDate: req.query.toDate,
    });
    res.json({ success: true, data });
});
