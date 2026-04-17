import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ScrapEntry } from '../models/scrapEntry.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { RepairJobCard } from '../models/repairJobCard.model.js';
import { syncComplaintStatus } from './complaint.controller.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import { generateServiceSequence } from '../utils/numberingUtils.js';

const generateScrapNo = async () => {
    return await generateServiceSequence(ScrapEntry, 'SCR-', 'scrapNo');
};

import mongoose from 'mongoose';

export const createScrapEntry = asyncHandler(async (req, res) => {
    const data = { ...req.body, createdBy: req.user.id };

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const jc = await RepairJobCard.findById(data.jobCardId).session(session);
        if (!jc) throw new ApiError(httpStatus.NOT_FOUND, 'Repair Job Card not found');

        // ── Pre-Validation ───────────────────────────────────────────────────────
        for (const si of (data.items || [])) {
            const jcItem = jc.items.find(ji => 
                (si.itemId && String(ji.itemId) === String(si.itemId)) || 
                (si.itemCode === si.itemCode)
            );

            if (!jcItem) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Item ${si.itemCode} was not part of this Job Card.`);
            }
            
            // Available is scrapQty (targeted in JC) minus what's already done (actual)
            const available = (jcItem.scrapQty || 0) - (jcItem.actualScrappedQty || 0);

            if (si.qty > available) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Qty to scrap exceeds job card scrap balance for ${si.itemCode}. Max allowed: ${available}, Attempted: ${si.qty}`);
            }
        }

        data.scrapNo = await generateScrapNo();
        const [entry] = await ScrapEntry.create([data], { session });

        // ── Record Scrap Movement & Update JC ────────────────────────────────────
        for (const si of entry.items) {
            if (!si.itemId || si.qty <= 0) continue;
            
            const item = await Item.findById(si.itemId).session(session);
            // Scrap doesn't increase shelf stock, but we track the movement
            
            await StockLedger.create([{
                date: entry.date,
                itemId: si.itemId,
                itemCode: si.itemCode,
                itemName: si.itemName,
                transactionType: 'SCRAP_ENTRY',
                stockBucket: 'SCRAP',
                referenceNo: entry.scrapNo,
                referenceId: entry._id,
                inQty: 0,
                outQty: si.qty, 
                runningStock: item?.currentStock || 0,
                financialYear: getFYFromDate(entry.date || new Date()),
                remarks: `Item scrapped from Job Card ${entry.jobCardNo}. Reason: ${si.reason}`,
                createdBy: req.user.id,
            }], { session });

            // ── Update RepairJobCard item counts (Actual Scrapped) ──────────────
            const jcItem = jc.items.find(ji => 
                (si.itemId && String(ji.itemId) === String(si.itemId)) || 
                (si.itemCode && ji.itemCode === si.itemCode)
            );
            if (jcItem) {
                jcItem.actualScrappedQty = (jcItem.actualScrappedQty || 0) + si.qty;
                jcItem.repairResult = 'Scrapped';
            }
        }

        // Auto-close JC if everything is inwarded/scrapped
        const allDone = jc.items.every(ji => ((ji.inwardedQty || 0) + (ji.actualScrappedQty || 0)) >= ((ji.repairedQty || 0) + (ji.scrapQty || 0)));
        if (allDone) jc.status = 'Closed';
        
        await jc.save({ session });

        if (entry.complaintId) await syncComplaintStatus(entry.complaintId);

        await session.commitTransaction();
        res.status(httpStatus.CREATED).send({ success: true, data: entry });
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const getScrapEntries = asyncHandler(async (req, res) => {
    const { jobCardId, complaintId, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (jobCardId) filter.jobCardId = jobCardId;
    if (complaintId) filter.complaintId = complaintId;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
        ScrapEntry.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
        ScrapEntry.countDocuments(filter),
    ]);
    res.send({ success: true, data, meta: { total } });
});

export const getScrapEntry = asyncHandler(async (req, res) => {
    const doc = await ScrapEntry.findById(req.params.id).lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
    res.send({ success: true, data: doc });
});

export const deleteScrapEntry = asyncHandler(async (req, res) => {
    const doc = await ScrapEntry.findById(req.params.id);
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
    const complaintId = doc.complaintId;
    await doc.deleteOne();
    if (complaintId) await syncComplaintStatus(complaintId);
    res.send({ success: true, message: 'Deleted' });
});
