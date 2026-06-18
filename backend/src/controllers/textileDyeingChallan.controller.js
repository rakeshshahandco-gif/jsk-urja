import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as svc from '../services/textileDyeingChallan.service.js';
import { assertTextileCompany } from '../services/textileProductionLot.service.js';
import { normalizeProcessType } from '../constants/textileJobWorkChallan.constants.js';

const cid = (req) => req.query.companyId || req.body?.companyId || req.companyId;
const pt = (req) => normalizeProcessType(req.processType || req.query.processType || req.body?.processType, 'Dyeing');

export const getMeta = asyncHandler(async (req, res) => {
    res.json({ success: true, data: svc.getMeta(pt(req)) });
});

export const getEligibility = asyncHandler(async (req, res) => {
    try {
        const { company, template } = await assertTextileCompany(cid(req));
        res.json({
            success: true,
            data: { eligible: true, companyId: company._id, companyName: company.companyName, templateCode: template.templateCode, processType: pt(req) },
        });
    } catch (err) {
        res.json({ success: true, data: { eligible: false, message: err.message } });
    }
});

export const listChallans = asyncHandler(async (req, res) => {
    const data = await svc.listChallans(cid(req), { ...req.query, processType: pt(req) });
    res.json({ success: true, data });
});

export const getChallan = asyncHandler(async (req, res) => {
    const data = await svc.getChallan(req.params.id, cid(req), pt(req));
    res.json({ success: true, data });
});

export const lookupBarcode = asyncHandler(async (req, res) => {
    const data = await svc.lookupByBarcode(cid(req), req.query.barcode, pt(req));
    res.json({ success: true, data });
});

export const createChallan = asyncHandler(async (req, res) => {
    const data = await svc.createChallan(cid(req), req.body, req.user?.id || req.user?._id, pt(req));
    res.status(httpStatus.CREATED).json({ success: true, data });
});

export const recordReturn = asyncHandler(async (req, res) => {
    const data = await svc.recordReturn(cid(req), req.params.id, req.body, req.user?.id || req.user?._id, pt(req));
    res.json({ success: true, data });
});

export const getBarcode = asyncHandler(async (req, res) => {
    const data = await svc.generateBarcodeDataUrl(req.params.id, cid(req));
    res.json({ success: true, data });
});

export const stockWithDyers = asyncHandler(async (req, res) => {
    const data = await svc.getStockWithDyersReport(cid(req), pt(req));
    res.json({ success: true, data });
});

export const pendingChallans = asyncHandler(async (req, res) => {
    const data = await svc.getPendingChallansReport(cid(req), pt(req));
    res.json({ success: true, data });
});

export const returnRegister = asyncHandler(async (req, res) => {
    const data = await svc.getReturnRegisterReport(cid(req), { ...req.query, processType: pt(req) });
    res.json({ success: true, data });
});

export const dyerLedger = asyncHandler(async (req, res) => {
    const data = await svc.getDyerLedgerReport(cid(req), pt(req));
    res.json({ success: true, data });
});

export const lossReport = asyncHandler(async (req, res) => {
    const data = await svc.getLossReport(cid(req), pt(req));
    res.json({ success: true, data });
});
