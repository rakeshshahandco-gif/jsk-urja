import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as svc from '../services/textileProductionOrder.service.js';
import { assertTextileCompany } from '../services/textileProductionLot.service.js';

const cid = (req) => req.query.companyId || req.body?.companyId || req.companyId;

export const getMeta = asyncHandler(async (req, res) => {
    res.json({ success: true, data: svc.getProductionOrderMeta() });
});

export const getEligibility = asyncHandler(async (req, res) => {
    try {
        const { company, template } = await assertTextileCompany(cid(req));
        res.json({
            success: true,
            data: { eligible: true, companyId: company._id, companyName: company.companyName, templateCode: template.templateCode },
        });
    } catch (err) {
        res.json({ success: true, data: { eligible: false, message: err.message } });
    }
});

export const listOrders = asyncHandler(async (req, res) => {
    const data = await svc.listProductionOrders(cid(req), req.query);
    res.json({ success: true, data });
});

export const getOrder = asyncHandler(async (req, res) => {
    const data = await svc.getProductionOrder(req.params.id, cid(req));
    res.json({ success: true, data });
});

export const createOrder = asyncHandler(async (req, res) => {
    const data = await svc.createProductionOrder(cid(req), req.body, req.user?.id || req.user?._id);
    res.status(httpStatus.CREATED).json({ success: true, data });
});

export const startOrder = asyncHandler(async (req, res) => {
    const data = await svc.startProductionOrder(req.params.id, cid(req), req.user?.id || req.user?._id);
    res.json({ success: true, data });
});

export const skipStage = asyncHandler(async (req, res) => {
    const data = await svc.skipStage(req.params.id, cid(req), req.body, req.user?.id || req.user?._id);
    res.json({ success: true, data });
});

export const completeStage = asyncHandler(async (req, res) => {
    const data = await svc.completeStage(req.params.id, cid(req), req.body, req.user?.id || req.user?._id);
    res.json({ success: true, data });
});

export const issueStage = asyncHandler(async (req, res) => {
    const data = await svc.issueStageToVendor(req.params.id, cid(req), req.body, req.user?.id || req.user?._id);
    res.json({ success: true, data });
});

export const receiveStage = asyncHandler(async (req, res) => {
    const data = await svc.receiveStageFromVendor(req.params.id, cid(req), req.body, req.user?.id || req.user?._id);
    res.json({ success: true, data });
});

export const dashboard = asyncHandler(async (req, res) => {
    const data = await svc.getProductionDashboard(cid(req), req.query);
    res.json({ success: true, data });
});
