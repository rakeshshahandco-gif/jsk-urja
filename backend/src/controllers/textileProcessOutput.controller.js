import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertTextileCompany } from '../services/textileProductionLot.service.js';
import * as svc from '../services/textileProcessOutput.service.js';
import * as demoSvc from '../services/textileProcessOutputDemo.service.js';

const cid = (req) => req.query.companyId || req.body?.companyId || req.companyId;
const userLabel = (req) => req.user?.name || req.user?.fullName || req.user?.email || 'Demo User';

export const getEligibility = asyncHandler(async (req, res) => {
    try {
        const { company, template } = await assertTextileCompany(cid(req));
        res.json({
            success: true,
            data: { eligible: true, companyId: company._id, templateCode: template.templateCode },
        });
    } catch (err) {
        res.json({ success: true, data: { eligible: false, message: err.message } });
    }
});

export const listAvailable = asyncHandler(async (req, res) => {
    const data = await svc.listAvailableProcessOutput(cid(req), req.query);
    res.json({ success: true, data });
});

export const getSummary = asyncHandler(async (req, res) => {
    const data = await svc.getProcessOutputSummary(cid(req));
    res.json({ success: true, data });
});

export const consume = asyncHandler(async (req, res) => {
    const data = await svc.consumeProcessOutputStock(
        cid(req),
        req.body.stockId,
        req.body,
        req.user?.id || req.user?._id,
    );
    res.json({ success: true, data });
});

export const getTrace = asyncHandler(async (req, res) => {
    const data = await svc.getProcessTraceByBarcode(cid(req), req.query.barcode);
    res.json({ success: true, data });
});

export const listStock = asyncHandler(async (req, res) => {
    const data = await svc.listProcessOutputStock(cid(req), req.query);
    res.json({ success: true, data });
});

export const listHistory = asyncHandler(async (req, res) => {
    const data = await svc.listProcessHistory(cid(req), req.query);
    res.json({ success: true, data });
});

export const getFgTransfers = asyncHandler(async (req, res) => {
    const data = await svc.getFinishedGoodsTransfers(cid(req), req.query);
    res.json({ success: true, data });
});

export const getPendingNextProcess = asyncHandler(async (req, res) => {
    const data = await svc.getPendingNextProcessReport(cid(req), req.query);
    res.json({ success: true, data });
});

export const getDemoStatus = asyncHandler(async (req, res) => {
    const data = await demoSvc.getDemoStatus(cid(req));
    res.json({ success: true, data });
});

export const seedDemo = asyncHandler(async (req, res) => {
    const data = await demoSvc.seedDemoProcessOutputStock(cid(req), req.user?.id || req.user?._id);
    res.json({ success: true, data });
});

export const previewDemoTransfer = asyncHandler(async (req, res) => {
    const data = await demoSvc.previewDemoTransfer(cid(req), req.body);
    res.json({ success: true, data });
});

export const executeDemoTransfer = asyncHandler(async (req, res) => {
    const data = await demoSvc.executeDemoTransfer(
        cid(req),
        req.body,
        req.user?.id || req.user?._id,
        userLabel(req),
    );
    res.json({ success: true, data });
});

export const resetDemo = asyncHandler(async (req, res) => {
    const data = await demoSvc.resetDemoFlow(cid(req), req.user?.id || req.user?._id);
    res.json({ success: true, data });
});
