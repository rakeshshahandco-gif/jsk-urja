import { ProductionScrap } from '../models/productionScrap.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { ProductionFailure } from '../models/productionFailure.model.js';
import { ReworkJobCard } from '../models/reworkJobCard.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const generateScrapNo = async () => {
    const last = await ProductionScrap.findOne().sort({ createdAt: -1 });
    if (!last || !last.scrapNo) return 'SCR-0001';
    const num = parseInt(last.scrapNo.split('-')[1]);
    return `SCR-${String(num + 1).padStart(4, '0')}`;
};

export const createScrap = asyncHandler(async (req, res) => {
    const data = req.body;

    const item = await Item.findById(data.itemId);
    if (!item) throw new ApiError(404, 'Item not found');

    data.itemCode = item.itemCode;
    data.itemName = item.itemName;
    data.scrapNo = await generateScrapNo();

    if (data.jobCardId) {
        const jobCard = await ReworkJobCard.findById(data.jobCardId);
        if (jobCard) data.jobCardNo = jobCard.jobCardNo;
    }

    const scrap = await ProductionScrap.create(data);

    // Stock Movement: Move into SCRAP bucket
    await StockLedger.create({
        date: new Date(),
        itemId: item._id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        transactionType: 'REWORK_SCRAP',
        stockBucket: 'SCRAP',
        referenceId: scrap._id,
        referenceNo: scrap.scrapNo,
        inQty: scrap.qtyScrap,
        outQty: 0,
        remarks: data.reason,
        createdBy: req.user?._id
    });

    scrap.stockMoved = true;
    await scrap.save();

    // Update parent entities if provided
    if (data.failureId) {
        const failure = await ProductionFailure.findById(data.failureId);
        if (failure) {
            failure.qtyScrap += data.qtyScrap;
            await failure.save();
        }
    }

    res.status(201).json(scrap);
});

export const getScraps = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.jobCardId) filter.jobCardId = req.query.jobCardId;
    if (req.query.failureId) filter.failureId = req.query.failureId;

    const scraps = await ProductionScrap.find(filter).sort({ createdAt: -1 });
    res.json(scraps);
});
