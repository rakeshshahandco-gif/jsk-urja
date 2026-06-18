import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as textileConversionService from '../services/textileConversion.service.js';

export const getEligibility = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    const data = await textileConversionService.assertTextileConversionAccess(companyId);
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
    res.json({ success: true, data: textileConversionService.getTextileConversionMeta() });
});

export const listMasters = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    const data = await textileConversionService.listConversionMasters(companyId, req.query);
    res.json({ success: true, data });
});

export const getMaster = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    const data = await textileConversionService.getConversionMaster(req.params.id, companyId);
    res.json({ success: true, data });
});

export const createMaster = asyncHandler(async (req, res) => {
    const companyId = req.body.companyId || req.companyId;
    const data = await textileConversionService.createConversionMaster(
        companyId,
        req.body,
        req.user?.id || req.user?._id,
    );
    res.status(httpStatus.CREATED).json({ success: true, data });
});

export const updateMaster = asyncHandler(async (req, res) => {
    const companyId = req.body.companyId || req.companyId;
    const data = await textileConversionService.updateConversionMaster(
        req.params.id,
        companyId,
        req.body,
        req.user?.id || req.user?._id,
    );
    res.json({ success: true, data });
});

export const removeMaster = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    await textileConversionService.deactivateConversionMaster(req.params.id, companyId);
    res.json({ success: true, message: 'Conversion master deactivated' });
});

export const previewCalc = asyncHandler(async (req, res) => {
    const companyId = req.body.companyId || req.companyId;
    const data = await textileConversionService.previewTransformation(companyId, req.body);
    res.json({ success: true, data });
});

export const listEntries = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    const data = await textileConversionService.listTransformations(companyId, req.query);
    res.json({ success: true, data });
});

export const getEntry = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    const data = await textileConversionService.getTransformation(req.params.id, companyId);
    res.json({ success: true, data });
});

export const createEntry = asyncHandler(async (req, res) => {
    const companyId = req.body.companyId || req.companyId;
    const data = await textileConversionService.createTransformation(
        companyId,
        req.body,
        req.user?.id || req.user?._id,
    );
    res.status(httpStatus.CREATED).json({ success: true, data });
});

export const cancelEntry = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    const data = await textileConversionService.cancelTransformation(
        req.params.id,
        companyId,
        req.user?.id || req.user?._id,
    );
    res.json({ success: true, data });
});

export const chainReport = asyncHandler(async (req, res) => {
    const companyId = req.query.companyId || req.companyId;
    const data = await textileConversionService.getTransformationChainReport(companyId);
    res.json({ success: true, data });
});
