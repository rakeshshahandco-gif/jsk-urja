import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { RepairJobCard } from '../models/repairJobCard.model.js';
import { syncComplaintStatus } from './complaint.controller.js';

const generateJobCardNo = async () => {
    const count = await RepairJobCard.countDocuments();
    return `JC-${String(count + 1).padStart(4, '0')}`;
};

export const createRepairJobCard = asyncHandler(async (req, res) => {
    const data = { ...req.body, createdBy: req.user.id };
    data.jobCardNo = await generateJobCardNo();
    const jc = await RepairJobCard.create(data);
    await syncComplaintStatus(jc.complaintId);
    res.status(httpStatus.CREATED).send({ success: true, data: jc });
});

export const getRepairJobCards = asyncHandler(async (req, res) => {
    const { complaintId, status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (complaintId) filter.complaintId = complaintId;
    if (status) filter.status = status;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
        RepairJobCard.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
        RepairJobCard.countDocuments(filter),
    ]);
    res.send({ success: true, data, meta: { total } });
});

export const getRepairJobCard = asyncHandler(async (req, res) => {
    const doc = await RepairJobCard.findById(req.params.id).lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Job Card not found');
    res.send({ success: true, data: doc });
});

export const updateRepairJobCard = asyncHandler(async (req, res) => {
    const jc = await RepairJobCard.findById(req.params.id);
    if (!jc) throw new ApiError(httpStatus.NOT_FOUND, 'Job Card not found');
    Object.assign(jc, req.body);
    jc.updatedBy = req.user.id;
    await jc.save();
    await syncComplaintStatus(jc.complaintId);
    res.send({ success: true, data: jc });
});

export const deleteRepairJobCard = asyncHandler(async (req, res) => {
    const doc = await RepairJobCard.findById(req.params.id);
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
    const complaintId = doc.complaintId;
    await doc.deleteOne();
    await syncComplaintStatus(complaintId);
    res.send({ success: true, message: 'Deleted' });
});
