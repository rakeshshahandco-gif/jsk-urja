import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ReplacementDispatch } from '../models/replacementDispatch.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { Complaint } from '../models/complaint.model.js';
import { syncComplaintStatus } from './complaint.controller.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import { generateServiceSequence } from '../utils/numberingUtils.js';

const generateDoNo = async () => {
    return await generateServiceSequence(ReplacementDispatch, 'RDO-', 'doNo');
};

export const createReplacementDispatch = asyncHandler(async (req, res) => {
    const data = { ...req.body, createdBy: req.user.id };

    const complaint = await Complaint.findById(data.complaintId);
    if (!complaint) throw new ApiError(httpStatus.NOT_FOUND, 'Complaint not found');

    // ── Pre-Validation ───────────────────────────────────────────────────────
    for (const di of (data.items || [])) {
        const compItem = complaint.items.find(ci => 
            (di.itemId && String(ci.itemId) === String(di.itemId)) || 
            (di.itemCode === ci.itemCode)
        );

        if (!compItem) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Item ${di.itemCode} is not part of this complaint.`);
        }
        
        let available = 0;
        if (complaint.serviceType === 'Advance Replacement') {
            available = (compItem.qtyFaultyReported || 0) - (compItem.dispatchedQty || 0);
        } else {
            available = (compItem.faultyReceivedQty || 0) - (compItem.dispatchedQty || 0);
        }

        if (di.qty > available) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Quantity exceeding available balance for ${di.itemCode}. Available: ${available}, Attempted: ${di.qty}`);
        }
    }

    data.doNo = await generateDoNo();
    data.stockReduced = false;
    const dispatch = await ReplacementDispatch.create(data);

    // ── Reduce saleable stock ────────────────────────────────────────────────
    for (const di of dispatch.items) {
        if (!di.itemId || di.qty <= 0) continue;
        const item = await Item.findById(di.itemId);
        if (!item) continue;
        item.currentStock = (item.currentStock || 0) - di.qty;
        await item.save();

        await StockLedger.create({
            date: dispatch.date,
            itemId: di.itemId, itemCode: di.itemCode, itemName: di.itemName,
            transactionType: 'REPLACEMENT_DISPATCH',
            referenceNo: dispatch.doNo, referenceId: dispatch._id,
            outQty: di.qty, inQty: 0,
            runningStock: item.currentStock,
            financialYear: getFYFromDate(dispatch.date || new Date()),
            remarks: `Replacement dispatch for complaint ${dispatch.complaintNo}`,
            createdBy: req.user.id,
        });
    }

    await ReplacementDispatch.findByIdAndUpdate(dispatch._id, { stockReduced: true });

    // Update complaint status
    await syncComplaintStatus(dispatch.complaintId);

    res.status(httpStatus.CREATED).send({ success: true, data: dispatch });
});

export const getReplacementDispatches = asyncHandler(async (req, res) => {
    const { complaintId, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (complaintId) filter.complaintId = complaintId;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
        ReplacementDispatch.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
        ReplacementDispatch.countDocuments(filter),
    ]);
    res.send({ success: true, data, meta: { total } });
});

export const getReplacementDispatch = asyncHandler(async (req, res) => {
    const doc = await ReplacementDispatch.findById(req.params.id).lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Replacement Dispatch not found');
    res.send({ success: true, data: doc });
});

export const deleteReplacementDispatch = asyncHandler(async (req, res) => {
    const dispatch = await ReplacementDispatch.findById(req.params.id);
    if (!dispatch) throw new ApiError(httpStatus.NOT_FOUND, 'Not found');

    // Reverse stock if already reduced
    if (dispatch.stockReduced) {
        for (const di of dispatch.items) {
            if (!di.itemId || di.qty <= 0) continue;
            const item = await Item.findById(di.itemId);
            if (!item) continue;
            item.currentStock = (item.currentStock || 0) + di.qty;
            await item.save();
            await StockLedger.create({
                date: new Date(),
                itemId: di.itemId, itemCode: di.itemCode, itemName: di.itemName,
                transactionType: 'REPLACEMENT_DISPATCH',
                referenceNo: dispatch.doNo, referenceId: dispatch._id,
                inQty: di.qty, outQty: 0, runningStock: item.currentStock,
                remarks: `Reversal: deleted RDO ${dispatch.doNo}`,
                createdBy: req.user.id,
            });
        }
    }

    await syncComplaintStatus(dispatch.complaintId);
    await dispatch.deleteOne();
    res.send({ success: true, message: 'Deleted' });
});
