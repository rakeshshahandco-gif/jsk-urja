import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as gpAnalysis from '../services/gpAnalysis.service.js';
import { getCostingSettings } from '../services/productCostEngine.service.js';
import { CostingSettings } from '../models/costingSettings.model.js';
import { listCostingAuditLogs } from '../services/costingAudit.service.js';

export const getProductGp = asyncHandler(async (req, res) => {
    const rows = await gpAnalysis.getProductWiseGpReport(req.query);
    res.status(200).json(new ApiResponse(200, rows, 'Product-wise GP report'));
});

export const getCustomerGp = asyncHandler(async (req, res) => {
    const rows = await gpAnalysis.getCustomerWiseGpReport(req.query);
    res.status(200).json(new ApiResponse(200, rows, 'Customer-wise GP report'));
});

export const getInvoiceGp = asyncHandler(async (req, res) => {
    const rows = await gpAnalysis.getInvoiceWiseGpReport(req.query);
    res.status(200).json(new ApiResponse(200, rows, 'Invoice-wise GP report'));
});

export const getNegativeGp = asyncHandler(async (req, res) => {
    const rows = await gpAnalysis.getNegativeGpReport(req.query);
    res.status(200).json(new ApiResponse(200, rows, 'Negative GP report'));
});

export const getExportDomesticGp = asyncHandler(async (req, res) => {
    const data = await gpAnalysis.getExportDomesticGpSummary(req.query);
    res.status(200).json(new ApiResponse(200, data, 'Export vs domestic GP'));
});

export const getHighMarginProducts = asyncHandler(async (req, res) => {
    const rows = await gpAnalysis.getHighLowMarginProducts(req.query, 'high');
    res.status(200).json(new ApiResponse(200, rows, 'High margin products'));
});

export const getLowMarginProducts = asyncHandler(async (req, res) => {
    const rows = await gpAnalysis.getHighLowMarginProducts(req.query, 'low');
    res.status(200).json(new ApiResponse(200, rows, 'Low margin products'));
});

export const getCostSourceExceptions = asyncHandler(async (req, res) => {
    const rows = await gpAnalysis.getCostSourceExceptionReport(req.query);
    res.status(200).json(new ApiResponse(200, rows, 'Cost source exceptions'));
});

export const getDirectorSummary = asyncHandler(async (req, res) => {
    const data = await gpAnalysis.getDirectorGpSummary(req.query);
    res.status(200).json(new ApiResponse(200, data, 'Director GP summary'));
});

export const getGpSettings = asyncHandler(async (req, res) => {
    const data = await getCostingSettings();
    res.status(200).json(new ApiResponse(200, data, 'Costing settings'));
});

export const patchGpSettings = asyncHandler(async (req, res) => {
    const patch = {};
    if (req.body.negativeGpThresholdPercent != null) patch.negativeGpThresholdPercent = Number(req.body.negativeGpThresholdPercent);
    if (req.body.highMarginThresholdPercent != null) patch.highMarginThresholdPercent = Number(req.body.highMarginThresholdPercent);
    if (req.body.lowMarginThresholdPercent != null) patch.lowMarginThresholdPercent = Number(req.body.lowMarginThresholdPercent);
    const doc = await CostingSettings.findOneAndUpdate({}, { $set: patch }, { upsert: true, new: true }).lean();
    res.status(200).json(new ApiResponse(200, doc, 'Costing settings updated'));
});

export const getCostingAudit = asyncHandler(async (req, res) => {
    const rows = await listCostingAuditLogs(req.query);
    res.status(200).json(new ApiResponse(200, rows, 'Costing audit log'));
});
