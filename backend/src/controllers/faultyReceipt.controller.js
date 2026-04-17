import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { FaultyReceipt } from '../models/faultyReceipt.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { Complaint } from '../models/complaint.model.js';
import { syncComplaintStatus } from './complaint.controller.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import { generateServiceSequence } from '../utils/numberingUtils.js';

const generateReceiptNo = async () => {
    return await generateServiceSequence(FaultyReceipt, 'FRN-', 'receiptNo');
};

export const createFaultyReceipt = asyncHandler(async (req, res) => {
    const data = { ...req.body, createdBy: req.user.id };

    const complaint = await Complaint.findById(data.complaintId);
    if (!complaint) throw new ApiError(httpStatus.NOT_FOUND, 'Complaint not found');

    // ── Pre-Validation ───────────────────────────────────────────────────────
    for (const ri of (data.items || [])) {
        const compItem = complaint.items.find(ci => 
            (ri.itemId && String(ci.itemId) === String(ri.itemId)) || 
            (ri.itemCode === ci.itemCode)
        );

        if (!compItem) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Item ${ri.itemCode} is not part of this complaint.`);
        }
        
        let available = 0;
        if (complaint.serviceType === 'Advance Replacement') {
            available = (compItem.dispatchedQty || 0) - (compItem.faultyReceivedQty || 0);
        } else {
            available = (compItem.qtyFaultyReported || 0) - (compItem.faultyReceivedQty || 0);
        }

        if (ri.qtyReceived > available) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Qty received exceeds allowed balance for ${ri.itemCode}. Available: ${available}, Attempted: ${ri.qtyReceived}`);
        }
    }

    data.receiptNo = await generateReceiptNo();
    const receipt = await FaultyReceipt.create(data);

    // ── Update Faulty Stock for each item ────────────────────────────────────
    for (const ri of receipt.items) {
        if (!ri.itemId || ri.qtyReceived <= 0) continue;
        const item = await Item.findById(ri.itemId);
        if (!item) continue;
        
        // Increase faulty stock bucket
        item.faultyStock = (item.faultyStock || 0) + ri.qtyReceived;
        await item.save();

        await StockLedger.create({
            date: receipt.date,
            itemId: ri.itemId,
            itemCode: ri.itemCode,
            itemName: ri.itemName,
            transactionType: 'FAULTY_RECEIPT',
            stockBucket: 'FAULTY',
            referenceNo: receipt.receiptNo,
            referenceId: receipt._id,
            inQty: ri.qtyReceived,
            outQty: 0,
            runningStock: item.currentStock, // Main currentStock remains same, but ledger shows move
            financialYear: getFYFromDate(receipt.date || new Date()),
            remarks: `Faulty material received back for complaint ${receipt.complaintNo}`,
            createdBy: req.user.id,
        });
    }

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
