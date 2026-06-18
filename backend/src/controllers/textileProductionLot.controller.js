import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as textileProductionLotService from '../services/textileProductionLot.service.js';

const resolveUserId = (user) => user?._id || user?.id || null;

export const getTextileEligibility = asyncHandler(async (req, res) => {
    const data = await textileProductionLotService.getTextileEligibility(req.params.companyId);
    res.json({ success: true, data });
});

export const listTextileProductionLots = asyncHandler(async (req, res) => {
    const data = await textileProductionLotService.listTextileProductionLots({
        companyId: req.query.companyId,
        lotStatus: req.query.lotStatus,
        search: req.query.search,
        limit: req.query.limit,
    });
    res.json({ success: true, data });
});

export const getTextileProductionLot = asyncHandler(async (req, res) => {
    const data = await textileProductionLotService.getTextileProductionLotById(req.params.id);
    res.json({ success: true, data });
});

export const createTextileProductionLot = asyncHandler(async (req, res) => {
    const data = await textileProductionLotService.createTextileProductionLot(req.body, resolveUserId(req.user));
    res.status(httpStatus.CREATED).json({ success: true, data, message: 'Textile lot created' });
});

export const recordDyeingIssue = asyncHandler(async (req, res) => {
    const data = await textileProductionLotService.recordDyeingIssue(req.params.id, req.body, resolveUserId(req.user));
    res.json({ success: true, data, message: 'Dyeing issue recorded' });
});

export const recordDyeingReturn = asyncHandler(async (req, res) => {
    const data = await textileProductionLotService.recordDyeingReturn(req.params.id, req.body, resolveUserId(req.user));
    res.json({ success: true, data, message: 'Dyeing return recorded' });
});

export const startTextileStage = asyncHandler(async (req, res) => {
    const data = await textileProductionLotService.startTextileStage(
        req.params.id,
        req.params.stageIndex,
        req.body,
        resolveUserId(req.user),
    );
    res.json({ success: true, data, message: 'Stage started' });
});

export const completeTextileStage = asyncHandler(async (req, res) => {
    const data = await textileProductionLotService.completeTextileStage(
        req.params.id,
        req.params.stageIndex,
        req.body,
        resolveUserId(req.user),
    );
    res.json({ success: true, data, message: 'Stage completed' });
});

export const getTextileLotReport = asyncHandler(async (req, res) => {
    const data = await textileProductionLotService.getTextileLotReport(req.params.id);
    res.json({ success: true, data });
});
