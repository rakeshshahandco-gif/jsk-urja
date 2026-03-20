import { ProductionOutput } from '../models/productionOutput.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const generateEntryNo = async () => {
    const count = await ProductionOutput.countDocuments();
    const y = new Date().getFullYear();
    return `PO-${y}-${String(count + 1).padStart(5, '0')}`;
};

// POST /production-outputs
export const createProductionOutput = asyncHandler(async (req, res) => {
    const { date, workOrderId, workOrderNo, finishedItemId, qtyProduced, warehouse, remarks } = req.body;

    if (!finishedItemId || !qtyProduced) throw new ApiError(400, 'finishedItemId and qtyProduced are required');

    const item = await Item.findById(finishedItemId);
    if (!item) throw new ApiError(404, 'Item not found');

    const entryNo = await generateEntryNo();

    const entry = await ProductionOutput.create({
        entryNo,
        date: date || new Date(),
        workOrderId: workOrderId || null,
        workOrderNo: workOrderNo || '',
        finishedItemId,
        finishedItemCode: item.itemCode,
        finishedItemName: item.itemName,
        qtyProduced: Number(qtyProduced),
        warehouse: warehouse || '',
        remarks: remarks || '',
        createdBy: req.user._id,
    });

    // Update stock — increase finished goods
    const oldStock = item.currentStock || 0;
    item.currentStock = oldStock + Number(qtyProduced);
    await item.save();

    await StockLedger.create({
        date: entry.date,
        itemId: item._id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        transactionType: 'WO_OUTPUT',
        referenceNo: entryNo,
        referenceId: entry._id,
        inQty: Number(qtyProduced),
        outQty: 0,
        rate: item.valuationRate || 0,
        amount: Math.round(Number(qtyProduced) * (item.valuationRate || 0) * 100) / 100,
        runningStock: item.currentStock,
        warehouse: warehouse || '',
        remarks: `Production Output: ${entryNo}`,
        createdBy: req.user._id,
    });

    res.status(201).json(new ApiResponse(201, entry, `Production Output ${entryNo} created. Stock updated.`));
});

// GET /production-outputs
export const getProductionOutputs = asyncHandler(async (req, res) => {
    const { page = 1, limit = 30 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const total = await ProductionOutput.countDocuments();
    const entries = await ProductionOutput.find()
        .sort({ date: -1, createdAt: -1 })
        .skip(skip).limit(Number(limit))
        .populate('finishedItemId', 'itemCode itemName')
        .populate('createdBy', 'name');
    res.json(new ApiResponse(200, { entries, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }, 'Production Outputs'));
});

// GET /production-outputs/:id
export const getProductionOutputById = asyncHandler(async (req, res) => {
    const entry = await ProductionOutput.findById(req.params.id)
        .populate('finishedItemId', 'itemCode itemName uom')
        .populate('createdBy', 'name');
    if (!entry) throw new ApiError(404, 'Entry not found');
    res.json(new ApiResponse(200, entry, 'Production Output'));
});
