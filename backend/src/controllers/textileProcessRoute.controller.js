import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as svc from '../services/textileProcessRoute.service.js';
import { assertTextileCompany } from '../services/textileProductionLot.service.js';

const cid = (req) => req.query.companyId || req.body?.companyId || req.companyId;

export const getMeta = asyncHandler(async (req, res) => {
    res.json({ success: true, data: svc.getProcessRouteMeta() });
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

export const listRoutes = asyncHandler(async (req, res) => {
    const data = await svc.listProcessRoutes(cid(req), req.query);
    res.json({ success: true, data });
});

export const getRoute = asyncHandler(async (req, res) => {
    const data = await svc.getProcessRoute(req.params.id, cid(req));
    res.json({ success: true, data });
});

export const createRoute = asyncHandler(async (req, res) => {
    const data = await svc.createProcessRoute(cid(req), req.body, req.user?.id || req.user?._id);
    res.status(httpStatus.CREATED).json({ success: true, data });
});

export const updateRoute = asyncHandler(async (req, res) => {
    const data = await svc.updateProcessRoute(req.params.id, cid(req), req.body, req.user?.id || req.user?._id);
    res.json({ success: true, data });
});

export const deactivateRoute = asyncHandler(async (req, res) => {
    const data = await svc.deactivateProcessRoute(req.params.id, cid(req), req.user?.id || req.user?._id);
    res.json({ success: true, data });
});
