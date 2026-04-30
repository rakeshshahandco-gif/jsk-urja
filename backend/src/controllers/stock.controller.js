import mongoose from 'mongoose';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// ── Helper: IST date boundaries ───────────────────────────────────────────────
const istBoundaries = (dateStr) => {
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const d = new Date(dateStr);
    const startIST = new Date(d);
    startIST.setUTCHours(0, 0, 0, 0);
    const startUTC = new Date(startIST.getTime() - IST_OFFSET);
    const endIST = new Date(d);
    endIST.setUTCHours(23, 59, 59, 999);
    const endUTC = new Date(endIST.getTime() - IST_OFFSET);
    return { startUTC, endUTC };
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Raw Material Stock Report
// GET /api/v1/stock/raw-material-report
// ─────────────────────────────────────────────────────────────────────────────
export const getRawMaterialReport = asyncHandler(async (req, res) => {
    const { dateFrom, dateTo, itemId, search } = req.query;

    const dateFilter = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
    }

    // Get all raw material items
    const itemQuery = {
        itemCategory: 'RAW_MATERIAL',
        isActive: true,
    };
    if (itemId) itemQuery._id = new mongoose.Types.ObjectId(itemId);
    if (search) {
        itemQuery.$or = [
            { itemName: { $regex: search, $options: 'i' } },
            { itemCode: { $regex: search, $options: 'i' } },
        ];
    }

    const items = await Item.find(itemQuery).select('_id itemCode itemName itemType uom openingStock currentStock valuationRate minStockLevel').lean();

    const results = await Promise.all(items.map(async (item) => {
        const ledgerMatch = {
            itemId: item._id,
        };
        
        let ledger = await StockLedger.find(ledgerMatch).lean();
        
        let beforeRange = [];
        let inRange = ledger;
        
        if (dateFrom) {
            const from = new Date(dateFrom);
            beforeRange = ledger.filter(l => new Date(l.date) < from);
            inRange = ledger.filter(l => new Date(l.date) >= from);
        }
        if (dateTo) {
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            inRange = inRange.filter(l => new Date(l.date) <= to);
        }

        const openingQty = (item.openingStock || 0) + beforeRange.reduce((s, l) => s + (l.inQty || 0) - (l.outQty || 0), 0);

        const purchaseQty = inRange.filter(l => ['GRN', 'PURCHASE_INVOICE'].includes((l.transactionType || '').toUpperCase().trim())).reduce((s, l) => s + (l.inQty || 0), 0);
        const consumedQty = inRange.filter(l => ['WO_CONSUMPTION', 'MODEL_CONVERSION'].includes((l.transactionType || '').toUpperCase().trim())).reduce((s, l) => s + (l.outQty || 0), 0);
        const replacementQty = inRange.filter(l => (l.transactionType || '').toUpperCase().trim() === 'COMPONENT_REPLACEMENT').reduce((s, l) => s + (l.outQty || 0), 0);
        const rejectionQty = inRange.filter(l => ['SCRAP_ENTRY', 'PROD_REJECTION', 'PROD_FAILURE'].includes((l.transactionType || '').toUpperCase().trim())).reduce((s, l) => s + (l.outQty || 0), 0);
        const returnedQty = inRange.filter(l => (l.transactionType || '').toUpperCase().trim() === 'MODEL_CONVERSION').reduce((s, l) => s + (l.inQty || 0), 0);
        
        const otherIn = inRange.filter(l => !['GRN', 'PURCHASE_INVOICE', 'MODEL_CONVERSION'].includes((l.transactionType || '').toUpperCase().trim()) && l.inQty > 0).reduce((s, l) => s + (l.inQty || 0), 0);
        const otherOut = inRange.filter(l => !['WO_CONSUMPTION', 'COMPONENT_REPLACEMENT', 'SCRAP_ENTRY', 'PROD_REJECTION', 'PROD_FAILURE', 'MODEL_CONVERSION'].includes((l.transactionType || '').toUpperCase().trim()) && l.outQty > 0).reduce((s, l) => s + (l.outQty || 0), 0);

        const closingQty = openingQty + purchaseQty + returnedQty + otherIn - consumedQty - replacementQty - rejectionQty - otherOut;

        return {
            itemId: item._id,
            itemCode: item.itemCode,
            itemName: item.itemName,
            itemType: item.itemType || '',
            uom: item.uom,
            openingQty: Math.round(openingQty * 100) / 100,
            purchaseQty: Math.round(purchaseQty * 100) / 100,
            consumedQty: Math.round(consumedQty * 100) / 100,
            returnedQty: Math.round(returnedQty * 100) / 100,
            replacementQty: Math.round(replacementQty * 100) / 100,
            rejectionQty: Math.round(rejectionQty * 100) / 100,
            adjustmentIn: Math.round(otherIn * 100) / 100,
            adjustmentOut: Math.round(otherOut * 100) / 100,
            closingQty: Math.round(closingQty * 100) / 100,
            currentStock: item.currentStock || 0,
            valuationRate: item.valuationRate || 0,
            stockValue: Math.round(((item.currentStock || 0) * (item.valuationRate || 0)) * 100) / 100,
            belowReorder: (item.currentStock || 0) < (item.minStockLevel || 0),
        };
    }));

    res.json(new ApiResponse(200, results, 'Raw Material Stock Report'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Finished Goods Stock Report
// GET /api/v1/stock/finished-goods-report
// ─────────────────────────────────────────────────────────────────────────────
export const getFinishedGoodsReport = asyncHandler(async (req, res) => {
    const { dateFrom, dateTo, itemId, search } = req.query;

    const dateFilter = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
    }

    const itemQuery = {
        itemCategory: { $in: ['FINISHED_GOOD', 'TRADING'] },
        isActive: true,
    };
    if (itemId) itemQuery._id = new mongoose.Types.ObjectId(itemId);
    if (search) {
        itemQuery.$or = [
            { itemName: { $regex: search, $options: 'i' } },
            { itemCode: { $regex: search, $options: 'i' } },
        ];
    }

    const items = await Item.find(itemQuery).select('_id itemCode itemName itemType uom openingStock currentStock valuationRate minStockLevel').lean();

    const results = await Promise.all(items.map(async (item) => {
        const ledgerMatch = {
            itemId: item._id,
            ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {})
        };
        const ledger = await StockLedger.find(ledgerMatch).lean();

        const productionQty = ledger.filter(l => l.transactionType === 'WO_OUTPUT').reduce((s, l) => s + (l.inQty || 0), 0);
        const conversionIn = ledger.filter(l => l.transactionType === 'MODEL_CONVERSION').reduce((s, l) => s + (l.inQty || 0), 0);
        const conversionOut = ledger.filter(l => l.transactionType === 'MODEL_CONVERSION').reduce((s, l) => s + (l.outQty || 0), 0);
        const salesQty = ledger.filter(l => l.transactionType === 'SALES_INVOICE').reduce((s, l) => s + (l.outQty || 0), 0);
        const replacementDispatch = ledger.filter(l => l.transactionType === 'REPLACEMENT_DISPATCH').reduce((s, l) => s + (l.outQty || 0), 0);
        const repairInward = ledger.filter(l => l.transactionType === 'REPAIR_INWARD').reduce((s, l) => s + (l.inQty || 0), 0);
        const adjustmentIn = ledger.filter(l => l.transactionType === 'ADJUSTMENT').reduce((s, l) => s + (l.inQty || 0), 0);
        const adjustmentOut = ledger.filter(l => l.transactionType === 'ADJUSTMENT').reduce((s, l) => s + (l.outQty || 0), 0);

        const openingQty = item.openingStock || 0;
        const closingQty = openingQty + productionQty + repairInward + adjustmentIn + conversionIn - salesQty - replacementDispatch - adjustmentOut - conversionOut;

        return {
            itemId: item._id,
            itemCode: item.itemCode,
            itemName: item.itemName,
            itemType: item.itemType || '',
            uom: item.uom,
            openingQty,
            productionQty: Math.round(productionQty * 100) / 100,
            conversionIn: Math.round(conversionIn * 100) / 100,
            conversionOut: Math.round(conversionOut * 100) / 100,
            salesQty: Math.round(salesQty * 100) / 100,
            replacementDispatch: Math.round(replacementDispatch * 100) / 100,
            adjustmentIn: Math.round(adjustmentIn * 100) / 100,
            adjustmentOut: Math.round(adjustmentOut * 100) / 100,
            closingQty: Math.round(closingQty * 100) / 100,
            currentStock: item.currentStock || 0,
            valuationRate: item.valuationRate || 0,
            stockValue: Math.round(((item.currentStock || 0) * (item.valuationRate || 0)) * 100) / 100,
            belowReorder: (item.currentStock || 0) < (item.minStockLevel || 0),
        };
    }));

    res.json(new ApiResponse(200, results, 'Finished Goods Stock Report'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Stock Movement Ledger (per item)
// GET /api/v1/stock/ledger/:itemId
// ─────────────────────────────────────────────────────────────────────────────
export const getStockLedger = asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const { dateFrom, dateTo, page = 1, limit = 100 } = req.query;

    const item = await Item.findById(itemId).select('itemCode itemName itemCategory itemType uom openingStock currentStock valuationRate').lean();
    if (!item) return res.status(404).json(new ApiResponse(404, null, 'Item not found'));

    const match = { itemId: new mongoose.Types.ObjectId(itemId) };
    if (dateFrom || dateTo) {
        match.date = {};
        if (dateFrom) match.date.$gte = new Date(dateFrom);
        if (dateTo) {
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            match.date.$lte = end;
        }
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await StockLedger.countDocuments(match);
    const entries = await StockLedger.find(match)
        .sort({ date: 1, createdAt: 1 })
        .skip(skip).limit(Number(limit))
        .lean();

    const typeLabels = {
        GRN: 'Purchase (GRN)', PURCHASE_INVOICE: 'Direct Purchase', PURCHASE_INVOICE_DELETE: 'Purchase Correction', WO_CONSUMPTION: 'Production Consumption', WO_OUTPUT: 'Production Output',
        COMPONENT_REPLACEMENT: 'Component Replacement', PROD_REJECTION: 'Production Rejection',
        OPENING: 'Opening Balance', ADJUSTMENT: 'Adjustment', RETURN: 'Return',
        SALES_INVOICE: 'Sales Invoice', SALES_INVOICE_CANCEL: 'Sales Return',
        REPLACEMENT_DISPATCH: 'Replacement Dispatch', FAULTY_RECEIPT: 'Faulty Receipt',
        REPAIR_INWARD: 'Repair Inward', SCRAP_ENTRY: 'Scrap', PROD_FAILURE: 'Production Failure',
        REWORK_CONSUMPTION: 'Rework Consumption', REWORK_QC_PASS: 'Rework Output',
        MODEL_CONVERSION: 'Model Conversion / Rework',
    };

    const rows = entries.map(e => ({
        _id: e._id,
        date: e.date,
        transactionType: e.transactionType,
        voucherType: e.voucherType || typeLabels[e.transactionType] || e.transactionType,
        referenceNo: e.referenceNo,
        referenceId: e.referenceId,
        partyName: e.partyName || '',
        partyCode: e.partyCode || '',
        inQty: e.inQty || 0,
        outQty: e.outQty || 0,
        rate: e.rate || 0,
        amount: e.amount || 0,
        balance: e.runningStock || 0,
        remarks: e.remarks || '',
    }));

    res.json(new ApiResponse(200, {
        item,
        rows,
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
    }, 'Stock Ledger'));
});

/**
 * Comprehensive Stock Movement Ledger with Qty + Value
 * Supports Party-wise, Item-wise and Group-wise movement
 */
export const getStockMovementLedger = asyncHandler(async (req, res) => {
    const { 
        dateFrom, dateTo, itemId, partyId, 
        itemCategory, itemType, transactionType, 
        search, financialYear 
    } = req.query;

    const query = {};
    if (financialYear) query.financialYear = financialYear;
    if (itemId) query.itemId = new mongoose.Types.ObjectId(itemId);
    if (partyId) query.partyId = new mongoose.Types.ObjectId(partyId);
    if (itemCategory) query.itemGroup = itemCategory;
    if (itemType) query.itemType = itemType;
    if (transactionType) query.transactionType = transactionType;

    if (search) {
        query.$or = [
            { itemName: { $regex: search, $options: 'i' } },
            { itemCode: { $regex: search, $options: 'i' } },
            { partyName: { $regex: search, $options: 'i' } },
            { referenceNo: { $regex: search, $options: 'i' } },
        ];
    }

    // Date Filter Logic for Opening vs Period
    let openingMatch = { ...query };
    let periodMatch = { ...query };

    if (dateFrom) {
        const fromDate = new Date(dateFrom);
        openingMatch.date = { $lt: fromDate };
        periodMatch.date = { ...periodMatch.date, $gte: fromDate };
    }

    if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        periodMatch.date = { ...periodMatch.date, $lte: toDate };
    }

    // 1. Calculate Opening Balance (Only if dateFrom is provided)
    let openingQty = 0;
    let openingValue = 0;

    if (dateFrom && itemId) {
        const opResult = await StockLedger.aggregate([
            { $match: openingMatch },
            { $group: { 
                _id: null, 
                totalIn: { $sum: '$inQty' }, 
                totalOut: { $sum: '$outQty' },
                totalInVal: { $sum: { $cond: [{ $gt: ['$inQty', 0] }, '$amount', 0] } },
                totalOutVal: { $sum: { $cond: [{ $gt: ['$outQty', 0] }, '$amount', 0] } }
            }}
        ]);

        // Get actual item to add its initial openingStock
        const item = await Item.findById(itemId).select('openingStock valuationRate');
        if (item) {
            openingQty = (item.openingStock || 0) + (opResult[0]?.totalIn || 0) - (opResult[0]?.totalOut || 0);
            // Valuation logic: use item rate for initial opening if ledger values are missing
            openingValue = (openingQty * (item.valuationRate || 0));
        }
    }

    // 2. Fetch Period Entries
    const entries = await StockLedger.find(periodMatch)
        .sort({ date: 1, createdAt: 1 })
        .lean();

    // 3. Process Rows & Calculate Running Balances
    let currentQty = openingQty;
    let totalInQty = 0;
    let totalOutQty = 0;
    let totalInValue = 0;
    let totalOutValue = 0;

    const rows = entries.map(e => {
        const inQty = e.inQty || 0;
        const outQty = e.outQty || 0;
        const amount = e.amount || 0;

        currentQty += (inQty - outQty);
        totalInQty += inQty;
        totalOutQty += outQty;

        if (inQty > 0) totalInValue += amount;
        if (outQty > 0) totalOutValue += amount;

        return {
            _id: e._id,
            date: e.date,
            itemCode: e.itemCode,
            itemName: e.itemName,
            uom: e.uom,
            transactionType: e.transactionType,
            voucherType: e.voucherType || e.transactionType,
            partyName: e.partyName,
            partyCode: e.partyCode,
            referenceNo: e.referenceNo,
            referenceId: e.referenceId,
            inQty,
            outQty,
            rate: e.rate || 0,
            amount,
            runningStock: currentQty,
            remarks: e.remarks
        };
    });

    const summary = {
        openingQty: Math.round(openingQty * 100) / 100,
        openingValue: Math.round(openingValue * 100) / 100,
        totalInQty: Math.round(totalInQty * 100) / 100,
        totalInValue: Math.round(totalInValue * 100) / 100,
        totalOutQty: Math.round(totalOutQty * 100) / 100,
        totalOutValue: Math.round(totalOutValue * 100) / 100,
        closingQty: Math.round(currentQty * 100) / 100,
        closingValue: Math.round((openingValue + totalInValue - totalOutValue) * 100) / 100
    };

    res.json(new ApiResponse(200, { summary, rows }, 'Stock Movement Ledger Fetched'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Master Stock Summary (grouped by category)
// GET /api/v1/stock/summary
// ─────────────────────────────────────────────────────────────────────────────
export const getStockSummary = asyncHandler(async (req, res) => {
    const { search } = req.query;
    const itemQuery = { isActive: true };
    if (search) {
        itemQuery.$or = [
            { itemName: { $regex: search, $options: 'i' } },
            { itemCode: { $regex: search, $options: 'i' } },
        ];
    }

    const items = await Item.find(itemQuery)
        .select('itemCode itemName itemCategory uom currentStock openingStock valuationRate minStockLevel')
        .sort({ itemCategory: 1, itemName: 1 })
        .lean();

    // Group by category
    const groups = {};
    for (const item of items) {
        const cat = item.itemCategory || 'OTHER';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push({
            itemId: item._id,
            itemCode: item.itemCode,
            itemName: item.itemName,
            uom: item.uom,
            openingStock: item.openingStock || 0,
            currentStock: item.currentStock || 0,
            valuationRate: item.valuationRate || 0,
            stockValue: Math.round(((item.currentStock || 0) * (item.valuationRate || 0)) * 100) / 100,
            minStockLevel: item.minStockLevel || 0,
            belowReorder: (item.currentStock || 0) < (item.minStockLevel || 0),
        });
    }

    // Category totals
    const summary = Object.entries(groups).map(([category, rows]) => ({
        category,
        totalItems: rows.length,
        totalStockValue: Math.round(rows.reduce((s, r) => s + r.stockValue, 0) * 100) / 100,
        belowReorderCount: rows.filter(r => r.belowReorder).length,
        rows,
    }));

    res.json(new ApiResponse(200, summary, 'Stock Summary'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Dashboard Stats
// GET /api/v1/stock/dashboard
// ─────────────────────────────────────────────────────────────────────────────
export const getStockDashboard = asyncHandler(async (req, res) => {
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const now = new Date();
    const istNow = new Date(now.getTime() + IST_OFFSET);
    const startIST = new Date(istNow); startIST.setUTCHours(0, 0, 0, 0);
    const endIST = new Date(istNow); endIST.setUTCHours(23, 59, 59, 999);
    const todayStartUTC = new Date(startIST.getTime() - IST_OFFSET);
    const todayEndUTC = new Date(endIST.getTime() - IST_OFFSET);

    const [
        rawItems, fgItems, belowReorderCount,
        productionToday, replacementToday
    ] = await Promise.all([
        Item.find({ itemCategory: 'RAW_MATERIAL', isActive: true }).select('currentStock valuationRate'),
        Item.find({ itemCategory: { $in: ['FINISHED_GOOD', 'TRADING'] }, isActive: true }).select('currentStock'),
        Item.countDocuments({
            isActive: true,
            $expr: { $lt: ['$currentStock', '$minStockLevel'] }
        }),
        StockLedger.aggregate([
            { $match: { transactionType: 'WO_OUTPUT', date: { $gte: todayStartUTC, $lte: todayEndUTC } } },
            { $group: { _id: null, totalQty: { $sum: '$inQty' }, count: { $sum: 1 } } }
        ]),
        StockLedger.aggregate([
            { $match: { transactionType: 'REPLACEMENT_DISPATCH', date: { $gte: todayStartUTC, $lte: todayEndUTC } } },
            { $group: { _id: null, totalQty: { $sum: '$outQty' }, count: { $sum: 1 } } }
        ])
    ]);

    const rawMaterialStockValue = Math.round(rawItems.reduce((s, i) => s + ((i.currentStock || 0) * (i.valuationRate || 0)), 0) * 100) / 100;
    const totalFinishedGoods = fgItems.reduce((s, i) => s + (i.currentStock || 0), 0);

    res.json(new ApiResponse(200, {
        rawMaterialStockValue,
        rawMaterialItemCount: rawItems.length,
        totalFinishedGoods,
        finishedGoodsItemCount: fgItems.length,
        belowReorderCount,
        productionTodayQty: productionToday[0]?.totalQty || 0,
        productionTodayCount: productionToday[0]?.count || 0,
        replacementTodayQty: replacementToday[0]?.totalQty || 0,
        replacementTodayCount: replacementToday[0]?.count || 0,
    }, 'Stock Dashboard'));
});
