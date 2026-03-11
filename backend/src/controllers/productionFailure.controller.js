import { ProductionFailure } from '../models/productionFailure.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const generateFailureNo = async () => {
    const last = await ProductionFailure.findOne().sort({ createdAt: -1 });
    if (!last || !last.failureNo) return 'PF-0001';
    const num = parseInt(last.failureNo.split('-')[1]);
    return `PF-${String(num + 1).padStart(4, '0')}`;
};

export const createFailure = asyncHandler(async (req, res) => {
    const data = req.body;

    // Verify Item
    const item = await Item.findById(data.itemId);
    if (!item) throw new ApiError(404, 'Item not found');

    data.itemCode = item.itemCode;
    data.itemName = item.itemName;
    data.failureNo = await generateFailureNo();

    const failure = await ProductionFailure.create(data);

    // Stock Movement: Move from SALEABLE (assumed built) to FAILED_PRODUCTION bucket
    // Since this is internal failure during production, we record an IN to FAILED_PRODUCTION
    // If it was already in SALEABLE, we should reduce SALEABLE, but usually this is caught before turning into SALEABLE.
    // For simplicity of Rework Module tracking, we create a PROD_FAILURE entry IN FAILED bucket.

    await StockLedger.create({
        date: new Date(),
        itemId: item._id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        transactionType: 'PROD_FAILURE',
        stockBucket: 'FAILED_PRODUCTION',
        referenceId: failure._id,
        referenceNo: failure.failureNo,
        inQty: failure.qtyFailed,
        outQty: 0,
        remarks: `Production Failure Entry at stage ${failure.stage}`,
        createdBy: req.user?._id
    });

    res.status(201).json(failure);
});

export const getFailures = asyncHandler(async (req, res) => {
    const failures = await ProductionFailure.find().sort({ createdAt: -1 });
    res.json(failures);
});

export const getFailureById = asyncHandler(async (req, res) => {
    const failure = await ProductionFailure.findById(req.params.id);
    if (!failure) throw new ApiError(404, 'Failure record not found');
    res.json(failure);
});

export const updateFailure = asyncHandler(async (req, res) => {
    const failure = await ProductionFailure.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!failure) throw new ApiError(404, 'Failure record not found');
    res.json(failure);
});
