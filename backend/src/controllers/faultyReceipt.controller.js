import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { FaultyReceipt } from '../models/faultyReceipt.model.js';
import { syncComplaintStatus } from './complaint.controller.js';

const generateReceiptNo = async () => {
    const count = await FaultyReceipt.countDocuments();
    return `FRN-${String(count + 1).padStart(4, '0')}`;
};

export const createFaultyReceipt = asyncHandler(async (req, res) => {
    const data = { ...req.body, createdBy: req.user.id };
    data.receiptNo = await generateReceiptNo();
    const receipt = await FaultyReceipt.create(data);
    // Update complaint aggregates
    await syncComplaintStatus(receipt.complaintId);
    res.status(httpStatus.CREATED).send({ success: true, data: receipt });
});

export const getFaultyReceipts = asyncHandler(async (req, res) => {
    const { complaintId, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (complaintId) filter.complaintId = complaintId;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
        FaultyReceipt.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
        FaultyReceipt.countDocuments(filter),
    ]);
    res.send({ success: true, data, meta: { total } });
});

export const getFaultyReceipt = asyncHandler(async (req, res) => {
    const doc = await FaultyReceipt.findById(req.params.id).lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Faulty Receipt not found');
    res.send({ success: true, data: doc });
});

export const deleteFaultyReceipt = asyncHandler(async (req, res) => {
    const doc = await FaultyReceipt.findById(req.params.id);
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
    const complaintId = doc.complaintId;
    await doc.deleteOne();
    await syncComplaintStatus(complaintId);
    res.send({ success: true, message: 'Deleted' });
});
