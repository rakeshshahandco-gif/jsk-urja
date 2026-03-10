import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { RepairedStockInward } from '../models/repairedStockInward.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { syncComplaintStatus } from './complaint.controller.js';

const generateInwardNo = async () => {
    const count = await RepairedStockInward.countDocuments();
    return `RSI-${String(count + 1).padStart(4, '0')}`;
};

export const createRepairedStockInward = asyncHandler(async (req, res) => {
    const data = { ...req.body, createdBy: req.user.id };
    data.inwardNo = await generateInwardNo();
    data.stockAdded = false;

    const inward = await RepairedStockInward.create(data);

    // ── Add repaired qty back to saleable stock ──────────────────────────────
    for (const ri of inward.items) {
        if (!ri.itemId || ri.qtyRepaired <= 0) continue;
        const item = await Item.findById(ri.itemId);
        if (!item) continue;
        item.currentStock = (item.currentStock || 0) + ri.qtyRepaired;
        await item.save();

        await StockLedger.create({
            date: inward.date,
            itemId: ri.itemId, itemCode: ri.itemCode, itemName: ri.itemName,
            transactionType: 'REPAIR_INWARD',
            referenceNo: inward.inwardNo, referenceId: inward._id,
            inQty: ri.qtyRepaired, outQty: 0,
            runningStock: item.currentStock,
            remarks: `Repaired stock inward — Job Card ${inward.jobCardNo}`,
            createdBy: req.user.id,
        });
    }

    await RepairedStockInward.findByIdAndUpdate(inward._id, { stockAdded: true });
    if (inward.complaintId) await syncComplaintStatus(inward.complaintId);

    res.status(httpStatus.CREATED).send({ success: true, data: inward });
});

export const getRepairedStockInwards = asyncHandler(async (req, res) => {
    const { jobCardId, complaintId, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (jobCardId) filter.jobCardId = jobCardId;
    if (complaintId) filter.complaintId = complaintId;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
        RepairedStockInward.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
        RepairedStockInward.countDocuments(filter),
    ]);
    res.send({ success: true, data, meta: { total } });
});

export const getRepairedStockInward = asyncHandler(async (req, res) => {
    const doc = await RepairedStockInward.findById(req.params.id).lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
    res.send({ success: true, data: doc });
});
