import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { Complaint } from '../models/complaint.model.js';
import { ReplacementDispatch } from '../models/replacementDispatch.model.js';
import { FaultyReceipt } from '../models/faultyReceipt.model.js';
import { RepairJobCard } from '../models/repairJobCard.model.js';

// ── Auto-number generator ────────────────────────────────────────────────────
const generateComplaintNo = async () => {
    const count = await Complaint.countDocuments();
    return `CMP-${String(count + 1).padStart(4, '0')}`;
};

// ── Auto-update complaint status based on linked docs ────────────────────────
export const syncComplaintStatus = async (complaintId) => {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) return;

    const dispatches = await ReplacementDispatch.find({ complaintId });
    const receipts = await FaultyReceipt.find({ complaintId });
    const jobCards = await RepairJobCard.find({ complaintId });

    const totalDispatched = dispatches.reduce((s, d) => s + d.items.reduce((ss, i) => ss + i.qty, 0), 0);
    const totalReceived = receipts.reduce((s, r) => s + r.items.reduce((ss, i) => ss + i.qtyReceived, 0), 0);
    const totalFaultyReported = complaint.items.reduce((s, i) => s + i.qtyFaultyReported, 0);

    // Update per-item counts
    for (const ci of complaint.items) {
        ci.dispatchedQty = dispatches.reduce((s, d) =>
            s + d.items.filter(di => String(di.itemId) === String(ci.itemId)).reduce((ss, di) => ss + di.qty, 0), 0);
        ci.faultyReceivedQty = receipts.reduce((s, r) =>
            s + r.items.filter(ri => String(ri.itemId) === String(ci.itemId)).reduce((ss, ri) => ss + ri.qtyReceived, 0), 0);
        ci.pendingReturnQty = Math.max(0, ci.dispatchedQty - ci.faultyReceivedQty);
    }

    // Determine status
    const hasRepair = jobCards.length > 0;
    const allRepairClosed = hasRepair && jobCards.every(jc => ['Repaired', 'Not Repairable', 'Closed'].includes(jc.status));

    let newStatus = complaint.status;
    if (complaint.status === 'Cancelled') { /* keep */ }
    else if (allRepairClosed) newStatus = 'Closed';
    else if (hasRepair) newStatus = 'Repair In Process';
    else if (totalDispatched > 0 && totalReceived >= totalFaultyReported) newStatus = 'Faulty Fully Received';
    else if (totalDispatched > 0 && totalReceived > 0) newStatus = 'Faulty Partially Received';
    else if (totalDispatched > 0) newStatus = 'Waiting Faulty Return';

    complaint.status = newStatus;
    await complaint.save();
    return complaint;
};

// ── CRUD ─────────────────────────────────────────────────────────────────────
export const createComplaint = asyncHandler(async (req, res) => {
    const data = { ...req.body, createdBy: req.user.id };
    data.complaintNo = await generateComplaintNo();
    const complaint = await Complaint.create(data);
    res.status(httpStatus.CREATED).send({ success: true, data: complaint });
});

export const getComplaints = asyncHandler(async (req, res) => {
    const { search, status, customerId, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (customerId) filter.customerId = customerId;
    if (search) {
        filter.$or = [
            { complaintNo: { $regex: search, $options: 'i' } },
            { customerName: { $regex: search, $options: 'i' } },
        ];
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
        Complaint.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
        Complaint.countDocuments(filter),
    ]);
    res.send({ success: true, data, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
});

export const getComplaint = asyncHandler(async (req, res) => {
    const complaint = await Complaint.findById(req.params.id).lean();
    if (!complaint) throw new ApiError(httpStatus.NOT_FOUND, 'Complaint not found');

    // Fetch linked docs
    const [dispatches, receipts, jobCards] = await Promise.all([
        ReplacementDispatch.find({ complaintId: req.params.id }).lean(),
        FaultyReceipt.find({ complaintId: req.params.id }).lean(),
        RepairJobCard.find({ complaintId: req.params.id }).lean(),
    ]);

    res.send({ success: true, data: { ...complaint, dispatches, receipts, jobCards } });
});

export const updateComplaint = asyncHandler(async (req, res) => {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) throw new ApiError(httpStatus.NOT_FOUND, 'Complaint not found');
    Object.assign(complaint, req.body);
    complaint.updatedBy = req.user.id;
    await complaint.save();
    res.send({ success: true, data: complaint });
});

export const deleteComplaint = asyncHandler(async (req, res) => {
    await Complaint.findByIdAndDelete(req.params.id);
    res.send({ success: true, message: 'Complaint deleted' });
});
