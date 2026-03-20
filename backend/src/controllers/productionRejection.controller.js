import { ProductionRejection } from '../models/productionRejection.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const generateEntryNo = async () => {
    const count = await ProductionRejection.countDocuments();
    const y = new Date().getFullYear();
    return `PRJ-${y}-${String(count + 1).padStart(5, '0')}`;
};

// POST /production-rejections
export const createProductionRejection = asyncHandler(async (req, res) => {
    const { date, workOrderId, workOrderNo, items, remarks } = req.body;

    if (!items || items.length === 0) throw new ApiError(400, 'At least one item is required');

    const entryNo = await generateEntryNo();
    const ledgerEntries = [];
    const processedItems = [];

    for (const ri of items) {
        if (!ri.reason) throw new ApiError(400, `Reason is required for rejection (item: ${ri.itemName || ri.itemId})`);

        const item = await Item.findById(ri.itemId);
        if (!item) throw new ApiError(404, `Item not found: ${ri.itemId}`);

        const rejQty = Number(ri.rejectionQty);
        if (!item.allowNegativeStock && (item.currentStock || 0) < rejQty) {
            throw new ApiError(400, `Insufficient stock for ${item.itemName}. Available: ${item.currentStock}, Required: ${rejQty}`);
        }

        item.currentStock = (item.currentStock || 0) - rejQty;
        await item.save();

        ledgerEntries.push({
            date: date ? new Date(date) : new Date(),
            itemId: item._id,
            itemCode: item.itemCode,
            itemName: item.itemName,
            transactionType: 'PROD_REJECTION',
            referenceNo: entryNo,
            referenceId: null,
            inQty: 0,
            outQty: rejQty,
            rate: item.valuationRate || 0,
            amount: Math.round(rejQty * (item.valuationRate || 0) * 100) / 100,
            runningStock: item.currentStock,
            remarks: `Rejection: ${ri.reason} — ${entryNo}`,
            createdBy: req.user._id,
        });

        processedItems.push({
            itemId: ri.itemId,
            itemCode: item.itemCode,
            itemName: item.itemName,
            uom: item.uom || 'NOS',
            rejectionQty: rejQty,
            reason: ri.reason,
            remarks: ri.remarks || '',
        });
    }

    const entry = await ProductionRejection.create({
        entryNo,
        date: date || new Date(),
        workOrderId: workOrderId || null,
        workOrderNo: workOrderNo || '',
        items: processedItems,
        remarks: remarks || '',
        createdBy: req.user._id,
    });

    for (const le of ledgerEntries) le.referenceId = entry._id;
    await StockLedger.insertMany(ledgerEntries);

    res.status(201).json(new ApiResponse(201, entry, `Production Rejection ${entryNo} created. Stock reduced.`));
});

// GET /production-rejections
export const getProductionRejections = asyncHandler(async (req, res) => {
    const { page = 1, limit = 30 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const total = await ProductionRejection.countDocuments();
    const entries = await ProductionRejection.find()
        .sort({ date: -1 }).skip(skip).limit(Number(limit))
        .populate('createdBy', 'name');
    res.json(new ApiResponse(200, { entries, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }, 'Production Rejections'));
});

// GET /production-rejections/:id
export const getProductionRejectionById = asyncHandler(async (req, res) => {
    const entry = await ProductionRejection.findById(req.params.id).populate('createdBy', 'name');
    if (!entry) throw new ApiError(404, 'Entry not found');
    res.json(new ApiResponse(200, entry, 'Production Rejection'));
});
