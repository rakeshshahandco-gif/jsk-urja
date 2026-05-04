import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { Complaint } from '../models/complaint.model.js';
import { ReplacementDispatch } from '../models/replacementDispatch.model.js';
import { FaultyReceipt } from '../models/faultyReceipt.model.js';
import { RepairJobCard } from '../models/repairJobCard.model.js';
import { PurchaseOrder } from '../models/purchaseOrder.model.js';
import { GRN } from '../models/grn.model.js';
import { generateServiceSequence } from '../utils/numberingUtils.js';

// ── Auto-number generator ────────────────────────────────────────────────────
const generateComplaintNo = async () => {
    return await generateServiceSequence(Complaint, 'CMP-', 'complaintNo');
};

// ── Auto-update complaint status based on linked docs ────────────────────────
import mongoose from 'mongoose';
export const syncComplaintStatus = async (complaintId) => {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) return;

    const [dispatches, receipts, jobCards] = await Promise.all([
        ReplacementDispatch.find({ complaintId }).lean(),
        FaultyReceipt.find({ complaintId }).lean(),
        RepairJobCard.find({ complaintId }).lean(),
    ]);

    // Update per-item counts
    for (const ci of complaint.items) {
        const itemId = String(ci.itemId);

        // Sum Dispatch
        ci.dispatchedQty = dispatches.reduce((s, d) =>
            s + d.items.filter(di => String(di.itemId) === itemId).reduce((ss, di) => ss + (di.qty || 0), 0), 0);
        
        // Sum Receipt
        ci.faultyReceivedQty = receipts.reduce((s, r) =>
            s + r.items.filter(ri => String(ri.itemId) === itemId).reduce((ss, ri) => ss + (ri.qty || ri.qtyReceived || 0), 0), 0);

        // Sum Job Card (Technical Stage)
        const itemJobs = jobCards.flatMap(jc => jc.items.filter(ji => (ji.itemId && String(ji.itemId) === itemId) || (ji.itemCode === ci.itemCode)));
        ci.inRepairQty = itemJobs.reduce((s, ji) => s + (ji.qtyReceivedForRepair || 0), 0);
        ci.repairedQty = itemJobs.reduce((s, ji) => s + (ji.repairedQty || 0), 0);
        ci.scrappedQty = itemJobs.reduce((s, ji) => s + (ji.scrapQty || 0), 0);
        ci.inwardedQty = itemJobs.reduce((s, ji) => s + (ji.inwardedQty || 0), 0);
        ci.actualScrappedQty = itemJobs.reduce((s, ji) => s + (ji.actualScrappedQty || 0), 0);
        
        // Pending Return Utility
        if (complaint.serviceType === 'Advance Replacement') {
            ci.pendingReturnQty = Math.max(0, ci.dispatchedQty - ci.faultyReceivedQty);
        } else {
            ci.pendingReturnQty = Math.max(0, ci.qtyFaultyReported - ci.faultyReceivedQty);
        }
    }

    const totalDispatched = complaint.items.reduce((s, i) => s + i.dispatchedQty, 0);
    const totalReceived = complaint.items.reduce((s, i) => s + i.faultyReceivedQty, 0);
    const totalReported = complaint.items.reduce((s, i) => s + i.qtyFaultyReported, 0);

    const hasRepair = jobCards.length > 0;
    const allRepairClosed = hasRepair && jobCards.every(jc => ['Repaired', 'Not Repairable', 'Closed'].includes(jc.status));

    let newStatus = complaint.status;
    const isCreditNote = complaint.serviceType === 'Credit Note';

    if (complaint.status === 'Cancelled' || complaint.status === 'Closed') {
        // do nothing
    } else if (complaint.creditNoteId) {
        newStatus = 'Credit Note Issued';
    } else if (allRepairClosed) {
        newStatus = 'Resolved / Repaired';
    } else if (hasRepair) {
        newStatus = 'Under Technical Inspection';
    } else if (totalReceived >= totalReported && totalReported > 0) {
        newStatus = 'Faulty Fully Received';
    } else if (totalReceived > 0) {
        newStatus = 'Faulty Partially Received';
    } else if (complaint.serviceType === 'Advance Replacement' && totalDispatched > 0) {
        newStatus = 'Waiting Faulty Return';
    } else if (totalDispatched > 0) {
        newStatus = 'Replacement Sent';
    }

    complaint.status = newStatus;
    await complaint.save();
    return complaint;
};

// ── CRUD ─────────────────────────────────────────────────────────────────────
export const createComplaint = asyncHandler(async (req, res) => {
    const data = { ...req.body, createdBy: req.user.id };
    data.complaintNo = await generateComplaintNo();
    data.status = 'Open';
    
    // Default counts
    if (data.items) {
        data.items.forEach(i => {
            i.dispatchedQty = 0;
            i.faultyReceivedQty = 0;
            i.pendingReturnQty = 0;
            i.inRepairQty = 0;
            i.repairedQty = 0;
            i.scrappedQty = 0;
            i.inwardedQty = 0;
        });
    }

    const complaint = await Complaint.create(data);
    res.status(httpStatus.CREATED).send({ success: true, data: complaint });
});

/**
 * SCENARIO 3: Create Credit Note against a complaint
 */
import { Voucher } from '../models/voucher.model.js';
import { VoucherType } from '../models/voucherType.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import { getNextVoucherNo } from '../utils/voucherUtils.js';

export const createServiceCreditNote = asyncHandler(async (req, res) => {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) throw new ApiError(httpStatus.NOT_FOUND, 'Complaint not found');
    if (complaint.creditNoteId) throw new ApiError(httpStatus.BAD_REQUEST, 'Credit note already issued');

    const { totalAmount, items, vTypeId, date = new Date() } = req.body;

    const vType = await VoucherType.findById(vTypeId);
    if (!vType) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher Type not found');

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const fy = getFYFromDate(date);
        
        // Find necessary ledgers
        const salesReturnLedger = await AccountLedger.findOne({ name: /Sales Return/i }).session(session);
        const customerLedger = await AccountLedger.findOne({ referenceId: complaint.customerId }).session(session);

        if (!customerLedger) throw new ApiError(httpStatus.BAD_REQUEST, 'Customer Ledger not found');
        if (!salesReturnLedger) throw new ApiError(httpStatus.BAD_REQUEST, 'Sales Return Ledger not found');

        // Create Voucher
        // For Debit Note/Credit Note, nature should be as per VType
        const voucherNo = await getNextVoucherNo(vTypeId, date, session);

        const voucher = await Voucher.create([{
            voucherNo,
            date,
            voucherType: vType._id,
            voucherTypeName: vType.name,
            nature: 'Credit Note',
            totalAmount,
            partyId: customerLedger._id,
            partyName: customerLedger.name,
            items: [
                {
                    ledgerId: salesReturnLedger._id,
                    ledgerName: salesReturnLedger.name,
                    amount: totalAmount,
                    type: 'Debit', // Sales Return Dr
                    narration: `Credit note against Complaint ${complaint.complaintNo}`
                },
                {
                    ledgerId: customerLedger._id,
                    ledgerName: customerLedger.name,
                    amount: totalAmount,
                    type: 'Credit', // Customer Cr
                    narration: `Credit note against Complaint ${complaint.complaintNo}`
                }
            ],
            isSystemGenerated: true,
            createdBy: req.user.id,
            financialYear: fy
        }], { session });

        // Link to complaint
        complaint.creditNoteId = voucher[0]._id;
        complaint.status = 'Credit Note Issued';
        await complaint.save({ session });

        await session.commitTransaction();
        res.send({ success: true, data: voucher[0] });
    } catch (e) {
        await session.abortTransaction();
        throw e;
    } finally {
        session.endSession();
    }
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
    const [dispatches, receipts, jobCards, purchaseOrders, grns] = await Promise.all([
        ReplacementDispatch.find({ complaintId: req.params.id }).lean(),
        FaultyReceipt.find({ complaintId: req.params.id }).lean(),
        RepairJobCard.find({ complaintId: req.params.id }).lean(),
        PurchaseOrder.find({ complaintId: req.params.id }).lean(),
        GRN.find({ complaintId: req.params.id }).lean(),
    ]);

    res.send({ success: true, data: { ...complaint, dispatches, receipts, jobCards, purchaseOrders, grns } });
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
