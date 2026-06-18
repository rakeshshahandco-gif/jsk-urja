import pick from '../utils/pick.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as voucherAttachmentService from '../services/voucherAttachment.service.js';

export const listAttachments = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['voucherType', 'voucherId']);
    const options = pick(req.query, ['page', 'limit', 'sortBy']);
    const result = await voucherAttachmentService.queryAttachments(filter, options);
    res.send(new ApiResponse(200, result));
});

export const listByVoucher = asyncHandler(async (req, res) => {
    const { voucherType, voucherId } = req.params;
    const results = await voucherAttachmentService.listByVoucher(voucherType, voucherId);
    res.send(new ApiResponse(200, { results }));
});

export const searchVouchers = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['searchBy', 'search']);
    const options = pick(req.query, ['limit']);
    const result = await voucherAttachmentService.searchVouchers(filter, options);
    res.send(new ApiResponse(200, result));
});

export const missingReport = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['category']);
    const options = pick(req.query, ['limit']);
    const result = await voucherAttachmentService.queryMissingAttachments(filter, options);
    res.send(new ApiResponse(200, result));
});

export const summaryStats = asyncHandler(async (req, res) => {
    const stats = await voucherAttachmentService.getSummaryStats();
    res.send(new ApiResponse(200, stats));
});

export const uploadAttachment = asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No file uploaded');
    const body = pick(req.body, ['voucherType', 'voucherId', 'voucherNumber', 'partyName', 'billNo', 'amount', 'voucherDate', 'source', 'label']);
    const doc = await voucherAttachmentService.uploadAttachment(body, req.file, req.user.id);
    res.status(201).send(new ApiResponse(201, doc, 'Attachment uploaded'));
});

export const removeAttachment = asyncHandler(async (req, res) => {
    await voucherAttachmentService.deleteAttachment(req.params.id, req.user.id);
    res.send(new ApiResponse(200, null, 'Attachment removed'));
});
