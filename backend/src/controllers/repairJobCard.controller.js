import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { RepairJobCard } from '../models/repairJobCard.model.js';
import { Complaint } from '../models/complaint.model.js';
import { syncComplaintStatus } from './complaint.controller.js';
import { generateServiceSequence } from '../utils/numberingUtils.js';

const generateJobCardNo = async () => {
    return await generateServiceSequence(RepairJobCard, 'JC-', 'jobCardNo');
};

import mongoose from 'mongoose';

export const createRepairJobCard = asyncHandler(async (req, res) => {
    const data = { ...req.body, createdBy: req.user.id };

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const complaint = await Complaint.findById(data.complaintId).session(session);
        if (!complaint) throw new ApiError(httpStatus.NOT_FOUND, 'Complaint not found');

        // ── Pre-Validation ───────────────────────────────────────────────────────
        let allDone = true;
        let anyStarted = false;

        for (const ji of (data.items || [])) {
            const compItem = complaint.items.find(ci => 
                (ji.itemId && String(ci.itemId) === String(ji.itemId)) || 
                (ji.itemCode === ci.itemCode)
            );

            if (!compItem) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Item ${ji.itemCode} is not part of this complaint.`);
            }
            
            // 1. Check against Complaint Receipt Capacity
            const availableForRepair = (compItem.faultyReceivedQty || 0) - (compItem.inRepairQty || 0);
            if (ji.qtyReceivedForRepair > availableForRepair) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Qty for repair exceeds warehouse receipt for ${ji.itemCode}. Available: ${availableForRepair}, Attempted: ${ji.qtyReceivedForRepair}`);
            }

            // 2. Internal Quantity Validation
            if (((ji.repairedQty || 0) + (ji.scrapQty || 0)) > ji.qtyReceivedForRepair) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Total Repaired + Scrap (${(ji.repairedQty || 0) + (ji.scrapQty || 0)}) cannot exceed Qty for Repair (${ji.qtyReceivedForRepair}) for item ${ji.itemCode}`);
            }

            if (((ji.repairedQty || 0) + (ji.scrapQty || 0)) < ji.qtyReceivedForRepair) {
                allDone = false;
            }
            if ((ji.repairedQty || 0) > 0 || (ji.scrapQty || 0) > 0) {
                anyStarted = true;
            }
        }

        // ── Auto-Status Management ──────────────────────────────────────────────
        if (allDone && data.items?.length > 0) {
            data.status = 'Closed';
        } else if (anyStarted && data.status === 'Pending Inspection') {
            data.status = 'Under Repair';
        }

        data.jobCardNo = await generateJobCardNo();
        const jc = await RepairJobCard.create([data], { session });
        
        // Sync complaint counts & status
        await syncComplaintStatus(data.complaintId);
        
        await session.commitTransaction();
        res.status(httpStatus.CREATED).send({ success: true, data: jc[0] });
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
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
