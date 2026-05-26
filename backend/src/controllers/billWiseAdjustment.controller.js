import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { authorize } from '../middlewares/auth.middleware.js';
import {
    saveAdjustments,
    reverseAdjustment,
    fifoAllocate,
    getWorkspaceData,
    summarizeAgeing,
} from '../services/billWiseAdjustment.service.js';
import { BillWiseAdjustment } from '../models/billWiseAdjustment.model.js';

export const getBillWiseWorkspace = asyncHandler(async (req, res) => {
    const { ledgerId } = req.query;
    if (!ledgerId) throw new ApiError(httpStatus.BAD_REQUEST, 'ledgerId is required');
    const data = await getWorkspaceData(ledgerId, req.query);
    data.ageingSummary = summarizeAgeing(data.bills);
    res.send(new ApiResponse(httpStatus.OK, data));
});

export const fifoPreview = asyncHandler(async (req, res) => {
    const { ledgerId } = req.body;
    if (!ledgerId) throw new ApiError(httpStatus.BAD_REQUEST, 'ledgerId is required');
    const data = await getWorkspaceData(ledgerId, { ...req.query, ...req.body });
    const ledgerType = data.ledger?.type;
    const proposed = fifoAllocate({
        bills: data.bills,
        payments: data.payments,
        ledgerType,
    });
    res.send(new ApiResponse(httpStatus.OK, { proposed, bills: data.bills, payments: data.payments }));
});

export const applyBillWiseAdjustments = asyncHandler(async (req, res) => {
    const { ledgerId, lines, remarks, allowCrossFy } = req.body;
    if (!ledgerId || !Array.isArray(lines) || lines.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'ledgerId and lines[] are required');
    }
    const userId = req.user._id || req.user.id;
    const companyId = req.companyId;
    const roleName = req.user.role?.name || req.user.roleName || '';
    const created = await saveAdjustments({
        lines,
        ledgerId,
        userId,
        companyId,
        remarks: remarks || '',
        allowCrossFy: !!allowCrossFy,
        userRole: roleName,
    });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, { count: created.length, adjustments: created }, 'Applied'));
});

export const reverseBillWiseAdjustment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user._id || req.user.id;
    const roleName = req.user.role?.name || req.user.roleName || '';
    const isAdmin = roleName === 'admin' || roleName === 'superadmin';
    const row = await reverseAdjustment(id, userId, reason, isAdmin);
    res.send(new ApiResponse(httpStatus.OK, row));
});

export const getBillWiseHistory = asyncHandler(async (req, res) => {
    const { ledgerId, from, to, includeReversed } = req.query;
    const q = { companyId: req.companyId };
    if (ledgerId) q.ledgerId = ledgerId;
    if (includeReversed !== 'true') q.isReversed = false;
    if (from || to) {
        q.adjustmentDate = {};
        if (from) q.adjustmentDate.$gte = new Date(from);
        if (to) q.adjustmentDate.$lte = new Date(to);
    }
    const rows = await BillWiseAdjustment.find(q).sort({ adjustmentDate: -1 }).limit(500).lean();
    res.send(new ApiResponse(httpStatus.OK, rows));
});

export const getAdjustmentsForBill = asyncHandler(async (req, res) => {
    const { billId, billType } = req.query;
    if (!billId) throw new ApiError(httpStatus.BAD_REQUEST, 'billId is required');
    const type = billType === 'PurchaseInvoice' ? 'PurchaseInvoice' : 'SalesInvoice';
    const rows = await BillWiseAdjustment.find({
        companyId: req.companyId,
        billDocumentId: billId,
        billDocumentType: type,
    })
        .sort({ adjustmentDate: -1 })
        .lean();
    res.send(new ApiResponse(httpStatus.OK, rows));
});
