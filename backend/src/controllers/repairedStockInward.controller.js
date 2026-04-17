import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { RepairedStockInward } from '../models/repairedStockInward.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { RepairJobCard } from '../models/repairJobCard.model.js';
import { syncComplaintStatus } from './complaint.controller.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import { generateServiceSequence } from '../utils/numberingUtils.js';

const generateInwardNo = async () => {
    return await generateServiceSequence(RepairedStockInward, 'RSI-', 'inwardNo');
};

import mongoose from 'mongoose';

export const createRepairedStockInward = asyncHandler(async (req, res) => {
    const data = { ...req.body, createdBy: req.user.id };

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const jc = await RepairJobCard.findById(data.jobCardId).session(session);
        if (!jc) throw new ApiError(httpStatus.NOT_FOUND, 'Repair Job Card not found');

        // ── Pre-Validation ───────────────────────────────────────────────────────
        for (const ri of (data.items || [])) {
            const jcItem = jc.items.find(ji => 
                (ri.itemId && String(ji.itemId) === String(ri.itemId)) || 
                (ri.itemCode === ji.itemCode)
            );

            if (!jcItem) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Item ${ri.itemCode} was not part of this Job Card.`);
            }
            const available = (jcItem.repairedQty || 0) - (jcItem.inwardedQty || 0);

            if (ri.qtyRepaired > available) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Qty to inward exceeds repaired balance for ${ri.itemCode}. Max allowed: ${available}, Attempted: ${ri.qtyRepaired}`);
            }
        }

        data.inwardNo = await generateInwardNo();
        data.stockAdded = true; // Setting true since we are doing it in this transaction
        const [inward] = await RepairedStockInward.create([data], { session });

        // ── Add repaired qty back to saleable stock ──────────────────────────────
        for (const ri of inward.items) {
            if (!ri.itemId || ri.qtyRepaired <= 0) continue;
            
            const item = await Item.findById(ri.itemId).session(session);
            if (!item) continue;
            
            item.currentStock = (item.currentStock || 0) + ri.qtyRepaired;
            await item.save({ session });

            await StockLedger.create([{
                date: inward.date,
                itemId: ri.itemId, itemCode: ri.itemCode, itemName: ri.itemName,
                transactionType: 'REPAIR_INWARD',
                referenceNo: inward.inwardNo, referenceId: inward._id,
                inQty: ri.qtyRepaired, outQty: 0,
                runningStock: item.currentStock,
                financialYear: getFYFromDate(inward.date || new Date()),
                remarks: `Repaired stock inward — Job Card ${inward.jobCardNo}`,
                createdBy: req.user.id,
            }], { session });

            // ── Update RepairJobCard item counts (Inwarded) ────────────────────────────────
            const jcItem = jc.items.find(ji => 
                (ri.itemId && String(ji.itemId) === String(ri.itemId)) || 
                (ri.itemCode && ji.itemCode === ri.itemCode)
            );
            if (jcItem) {
                jcItem.inwardedQty = (jcItem.inwardedQty || 0) + ri.qtyRepaired;
            }
        }

        // Auto-close JC if everything is inwarded/scrapped
        const allDone = jc.items.every(ji => (ji.inwardedQty + (ji.actualScrappedQty || 0)) >= (ji.repairedQty + (ji.scrapQty || 0)));
        if (allDone) jc.status = 'Closed';
        
        await jc.save({ session });

        if (inward.complaintId) await syncComplaintStatus(inward.complaintId);

        await session.commitTransaction();
        res.status(httpStatus.CREATED).send({ success: true, data: inward });
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
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
