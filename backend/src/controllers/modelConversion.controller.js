import { ModelConversion } from '../models/modelConversion.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { recalculateStockLedger } from '../utils/stockUtils.js';
import mongoose from 'mongoose';

const generateConversionNo = async () => {
    const count = await ModelConversion.countDocuments();
    const y = new Date().getFullYear();
    return `MC-${y}-${String(count + 1).padStart(5, '0')}`;
};

export const createModelConversion = asyncHandler(async (req, res) => {
    const { date, fromItemId, toItemId, qty, returnedComponents, addedComponents, remarks, financialYear } = req.body;

    if (!fromItemId || !toItemId || !qty) {
        throw new ApiError(400, "From Item, To Item and Quantity are required");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const conversionNo = await generateConversionNo();
        
        // 1. Create Conversion Record
        const conversion = await ModelConversion.create([{
            conversionNo,
            date: date || new Date(),
            fromItemId,
            toItemId,
            qty: Number(qty),
            returnedComponents: returnedComponents || [],
            addedComponents: addedComponents || [],
            remarks: remarks || '',
            financialYear,
            createdBy: req.user._id
        }], { session });

        const mc = conversion[0];

        // 2. Fetch Item Info for Ledger
        const fromItem = await Item.findById(fromItemId).session(session);
        const toItem = await Item.findById(toItemId).session(session);

        if (!fromItem || !toItem) throw new ApiError(404, "Source or Target item not found");

        // 3. Deduct Source Product (OUT)
        await StockLedger.create([{
            date: mc.date,
            itemId: fromItemId,
            itemCode: fromItem.itemCode,
            itemName: fromItem.itemName,
            transactionType: 'MODEL_CONVERSION',
            referenceNo: conversionNo,
            referenceId: mc._id,
            inQty: 0,
            outQty: Number(qty),
            remarks: `Conversion TO ${toItem.itemCode}`,
            financialYear,
            createdBy: req.user._id
        }], { session });

        // 4. Add Target Product (IN)
        await StockLedger.create([{
            date: mc.date,
            itemId: toItemId,
            itemCode: toItem.itemCode,
            itemName: toItem.itemName,
            transactionType: 'MODEL_CONVERSION',
            referenceNo: conversionNo,
            referenceId: mc._id,
            inQty: Number(qty),
            outQty: 0,
            remarks: `Conversion FROM ${fromItem.itemCode}`,
            financialYear,
            createdBy: req.user._id
        }], { session });

        // 5. Handle Returned Components (IN to Stock)
        if (returnedComponents?.length > 0) {
            for (const comp of returnedComponents) {
                const item = await Item.findById(comp.itemId).session(session);
                await StockLedger.create([{
                    date: mc.date,
                    itemId: comp.itemId,
                    itemCode: item?.itemCode || comp.itemCode,
                    itemName: item?.itemName || comp.itemName,
                    transactionType: 'MODEL_CONVERSION',
                    referenceNo: conversionNo,
                    referenceId: mc._id,
                    inQty: Number(comp.qty),
                    outQty: 0,
                    remarks: `Returned from conversion ${fromItem.itemCode} -> ${toItem.itemCode}`,
                    financialYear,
                    createdBy: req.user._id
                }], { session });
            }
        }

        // 6. Handle Added Components (OUT from Stock)
        if (addedComponents?.length > 0) {
            for (const comp of addedComponents) {
                const item = await Item.findById(comp.itemId).session(session);
                await StockLedger.create([{
                    date: mc.date,
                    itemId: comp.itemId,
                    itemCode: item?.itemCode || comp.itemCode,
                    itemName: item?.itemName || comp.itemName,
                    transactionType: 'MODEL_CONVERSION',
                    referenceNo: conversionNo,
                    referenceId: mc._id,
                    inQty: 0,
                    outQty: Number(comp.qty),
                    remarks: `Added for conversion ${fromItem.itemCode} -> ${toItem.itemCode}`,
                    financialYear,
                    createdBy: req.user._id
                }], { session });
            }
        }

        // 7. Recalculate Stocks for all affected items
        const allAffectedItemIds = [
            fromItemId, 
            toItemId, 
            ...(returnedComponents || []).map(c => c.itemId),
            ...(addedComponents || []).map(c => c.itemId)
        ];
        
        // Remove duplicates
        const uniqueItemIds = [...new Set(allAffectedItemIds.map(id => id.toString()))];
        
        for (const itemId of uniqueItemIds) {
            await recalculateStockLedger(itemId, session);
        }

        await session.commitTransaction();
        res.status(201).json(new ApiResponse(201, mc, "Model Conversion successful and inventory updated"));

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

export const getModelConversions = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const total = await ModelConversion.countDocuments();
    const conversions = await ModelConversion.find()
        .sort({ createdAt: -1 })
        .skip(skip).limit(Number(limit))
        .populate('fromItemId', 'itemCode itemName')
        .populate('toItemId', 'itemCode itemName')
        .populate('createdBy', 'name');
        
    res.json(new ApiResponse(200, { conversions, total, page: Number(page), pages: Math.ceil(total / Number(limit)) }, "Model Conversions fetched"));
});
