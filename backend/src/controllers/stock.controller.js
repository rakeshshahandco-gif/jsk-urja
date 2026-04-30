import mongoose from 'mongoose';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { GRN } from '../models/grn.model.js';
import { WorkOrder } from '../models/workOrder.model.js';
import Customer from '../models/customer.model.js';
import { Supplier } from '../models/supplier.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { recalculateStockLedger } from '../utils/stockUtils.js';

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
    const { dateFrom, dateTo, itemId, search, financialYear } = req.query;

    let finalDateFrom = dateFrom;
    let finalDateTo = dateTo;

    if (financialYear && financialYear.includes('-')) {
        const [startYear] = financialYear.split('-');
        const fyStart = `${startYear}-04-01`;
        const fyEnd = `${parseInt(startYear) + 1}-03-31`;
        if (!finalDateFrom) finalDateFrom = fyStart;
        if (!finalDateTo) finalDateTo = fyEnd;
    }

    const dateFilter = {};
    if (finalDateFrom) dateFilter.$gte = new Date(finalDateFrom);
    if (finalDateTo) {
        const end = new Date(finalDateTo);
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
        
        if (finalDateFrom) {
            const from = new Date(finalDateFrom);
            beforeRange = ledger.filter(l => new Date(l.date) < from);
            inRange = ledger.filter(l => new Date(l.date) >= from);
        }
        if (finalDateTo) {
            const to = new Date(finalDateTo);
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
    const { dateFrom, dateTo, itemId, search, financialYear } = req.query;

    let finalDateFrom = dateFrom;
    let finalDateTo = dateTo;

    if (financialYear && financialYear.includes('-')) {
        const [startYear] = financialYear.split('-');
        const fyStart = `${startYear}-04-01`;
        const fyEnd = `${parseInt(startYear) + 1}-03-31`;
        if (!finalDateFrom) finalDateFrom = fyStart;
        if (!finalDateTo) finalDateTo = fyEnd;
    }

    const dateFilter = {};
    if (finalDateFrom) dateFilter.$gte = new Date(finalDateFrom);
    if (finalDateTo) {
        const end = new Date(finalDateTo);
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
        };
        const ledger = await StockLedger.find(ledgerMatch).lean();

        let beforeRange = [];
        let inRange = ledger;
        
        if (finalDateFrom) {
            const from = new Date(finalDateFrom);
            beforeRange = ledger.filter(l => new Date(l.date) < from);
            inRange = ledger.filter(l => new Date(l.date) >= from);
        }
        if (finalDateTo) {
            const to = new Date(finalDateTo);
            to.setHours(23, 59, 59, 999);
            inRange = inRange.filter(l => new Date(l.date) <= to);
        }

        const openingQty = (item.openingStock || 0) + beforeRange.reduce((s, l) => s + (l.inQty || 0) - (l.outQty || 0), 0);

        const productionQty = inRange.filter(l => l.transactionType === 'WO_OUTPUT').reduce((s, l) => s + (l.inQty || 0), 0);
        const conversionIn = inRange.filter(l => l.transactionType === 'MODEL_CONVERSION').reduce((s, l) => s + (l.inQty || 0), 0);
        const conversionOut = inRange.filter(l => l.transactionType === 'MODEL_CONVERSION').reduce((s, l) => s + (l.outQty || 0), 0);
        const salesQty = inRange.filter(l => l.transactionType === 'SALES_INVOICE').reduce((s, l) => s + (l.outQty || 0), 0);
        const replacementDispatch = inRange.filter(l => l.transactionType === 'REPLACEMENT_DISPATCH').reduce((s, l) => s + (l.outQty || 0), 0);
        const repairInward = inRange.filter(l => l.transactionType === 'REPAIR_INWARD').reduce((s, l) => s + (l.inQty || 0), 0);
        const adjustmentIn = inRange.filter(l => l.transactionType === 'ADJUSTMENT').reduce((s, l) => s + (l.inQty || 0), 0);
        const adjustmentOut = inRange.filter(l => l.transactionType === 'ADJUSTMENT').reduce((s, l) => s + (l.outQty || 0), 0);

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
        search, financialYear, includeCancelled = 'false'
    } = req.query;

    let finalDateFrom = dateFrom;
    let finalDateTo = dateTo;

    // Handle Financial Year Logic
    if (financialYear && financialYear.includes('-')) {
        const [startYear] = financialYear.split('-');
        const fyStart = `${startYear}-04-01`;
        const fyEnd = `${parseInt(startYear) + 1}-03-31`;
        
        if (!finalDateFrom) finalDateFrom = fyStart;
        if (!finalDateTo) finalDateTo = fyEnd;
    }

    const baseQuery = { isDeleted: { $ne: true } };
    if (includeCancelled === 'true') {
        delete baseQuery.isDeleted;
    } else {
        baseQuery.transactionType = { 
            $nin: ['SALES_INVOICE_CANCEL', 'PURCHASE_INVOICE_DELETE', 'PURCHASE_RETURN', 'PROD_REJECTION'] 
        };
    }

    if (itemId) baseQuery.itemId = new mongoose.Types.ObjectId(itemId);
    if (partyId) baseQuery.partyId = new mongoose.Types.ObjectId(partyId);
    if (itemCategory) baseQuery.itemGroup = itemCategory;
    if (itemType) baseQuery.itemType = itemType;
    if (transactionType) baseQuery.transactionType = transactionType;

    if (search) {
        baseQuery.$or = [
            { itemName: { $regex: search, $options: 'i' } },
            { itemCode: { $regex: search, $options: 'i' } },
            { partyName: { $regex: search, $options: 'i' } },
            { referenceNo: { $regex: search, $options: 'i' } },
        ];
    }

    // 1. Calculate Opening Balance
    let openingQty = 0;
    let openingValue = 0;
    let fromDateStart = null;
    let toDateEnd = null;

    if (finalDateFrom) {
        fromDateStart = new Date(`${finalDateFrom}T00:00:00.000Z`);
    }
    if (finalDateTo) {
        toDateEnd = new Date(`${finalDateTo}T23:59:59.999Z`);
    }

    if (fromDateStart) {
        const openingMatch = { ...baseQuery, date: { $lt: fromDateStart } };
        // IMPORTANT: Remove financialYear filter for opening balance calculation to include all past data
        delete openingMatch.financialYear;

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

        const item = await Item.findById(itemId).select('openingStock valuationRate');
        if (item) {
            openingQty = (item.openingStock || 0) + (opResult[0]?.totalIn || 0) - (opResult[0]?.totalOut || 0);
            openingValue = (openingQty * (item.valuationRate || 0));
        }
    }

    // 2. Fetch Period Entries
    const periodMatch = { ...baseQuery };
    if (fromDateStart) {
        periodMatch.date = { ...periodMatch.date, $gte: fromDateStart };
    }
    if (toDateEnd) {
        periodMatch.date = { ...periodMatch.date, $lte: toDateEnd };
    }

    const entries = await StockLedger.find(periodMatch)
        .sort({ date: 1, createdAt: 1 })
        .lean();

    // 3. Process Rows & Calculate Running Balances
    let currentQty = openingQty;
    let totalInQty = 0;
    let totalOutQty = 0;
    let totalInValue = 0;
    let totalOutValue = 0;

    // For debugging
    let minDate = null;
    let maxDate = null;

    const rows = entries.reduce((acc, e) => {
        const entryDate = new Date(e.date);
        
        // STRICT DATE FILTER CHECK (Safety check for MongoDB boundary issues)
        if (fromDateStart && entryDate < fromDateStart) return acc;
        if (toDateEnd && entryDate > toDateEnd) return acc;

        const inQty = e.inQty || 0;
        const outQty = e.outQty || 0;
        const amount = e.amount || 0;

        // Skip rows with no movement (zero/blank qty)
        if (inQty === 0 && outQty === 0) return acc;

        // Debug date tracking
        if (!minDate || entryDate < minDate) minDate = entryDate;
        if (!maxDate || entryDate > maxDate) maxDate = entryDate;

        currentQty += (inQty - outQty);
        totalInQty += inQty;
        totalOutQty += outQty;

        if (inQty > 0) totalInValue += amount;
        if (outQty > 0) totalOutValue += amount;

        // Enhanced Party Details
        let displayParty = e.partyName;
        if (!displayParty) {
            if (e.transactionType === 'WO_OUTPUT' || e.transactionType === 'WO_CONSUMPTION') {
                displayParty = `Work Order: ${e.referenceNo}`;
            } else if (e.transactionType === 'SALES_INVOICE' || e.transactionType === 'SALES_RETURN') {
                displayParty = 'Unknown Customer';
            } else if (e.transactionType === 'PURCHASE_INVOICE' || e.transactionType === 'PURCHASE_RETURN' || e.transactionType === 'GRN') {
                displayParty = 'Unknown Supplier';
            } else {
                displayParty = '-';
            }
        }

        // Determine Stock Source
        let stockSource = 'Other';
        if (e.transactionType === 'PURCHASE_INVOICE' || e.transactionType === 'GRN') {
            stockSource = (e.itemGroup === 'TRADING') ? 'Trading' : 'Raw Material';
        } else if (e.transactionType === 'WO_OUTPUT') {
            stockSource = 'Manufacturing';
        } else if (e.transactionType === 'SALES_INVOICE') {
            stockSource = (e.itemGroup === 'FINISHED_GOOD') ? 'Manufacturing' : 'Trading';
        } else if (e.transactionType === 'WO_CONSUMPTION') {
            stockSource = 'Raw Material';
        } else if (e.itemGroup === 'CONSUMABLE') {
            stockSource = 'Consumable';
        }

        acc.push({
            _id: e._id,
            date: e.date,
            itemCode: e.itemCode,
            itemName: e.itemName,
            itemGroup: e.itemGroup,
            stockSource,
            uom: e.uom,
            transactionType: e.transactionType,
            voucherType: e.voucherType || e.transactionType,
            partyName: displayParty,
            partyCode: e.partyCode,
            referenceNo: e.referenceNo,
            referenceId: e.referenceId,
            inQty,
            outQty,
            rate: e.rate || 0,
            amount,
            runningStock: currentQty,
            remarks: e.remarks
        });
        return acc;
    }, []);

    const summary = {
        openingQty: Math.round(openingQty * 100) / 100,
        openingValue: Math.round(openingValue * 100) / 100,
        totalInQty: Math.round(totalInQty * 100) / 100,
        totalInValue: Math.round(totalInValue * 100) / 100,
        totalOutQty: Math.round(totalOutQty * 100) / 100,
        totalOutValue: Math.round(totalOutValue * 100) / 100,
        closingQty: Math.round(currentQty * 100) / 100,
        closingValue: Math.round((openingValue + totalInValue - totalOutValue) * 100) / 100,
        debug: {
            selectedFY: financialYear,
            finalDateFrom,
            finalDateTo,
            totalEntriesFound: entries.length,
            rowsAfterStrictFilter: rows.length,
            minDateReturned: minDate,
            maxDateReturned: maxDate
        }
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

/**
 * ADMIN: Rebuild Stock Ledger from Source Documents
 * This utility purges existing ledger entries and re-synchronizes from primary docs.
 */
export const rebuildStockMovementLedger = asyncHandler(async (req, res) => {
    const { itemId, dryRun = 'false' } = req.body;
    if (!itemId) throw new ApiError(400, 'Item ID is required for rebuilding');

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const item = await Item.findById(itemId).session(session);
        if (!item) throw new ApiError(404, 'Item not found');

        const logs = [];
        logs.push(`Starting rebuild for ${item.itemName} (${item.itemCode})`);

        if (dryRun === 'false') {
            // 1. Purge existing entries
            await StockLedger.deleteMany({ itemId: item._id }).session(session);
            logs.push('Deleted existing ledger entries.');
        }

        const newEntries = [];

        // 2. Fetch Sales Invoices
        const sales = await SalesInvoice.find({
            'items.itemId': item._id,
            status: { $nin: ['Cancelled', 'Draft'] },
            isDeleted: { $ne: true }
        }).session(session);

        for (const inv of sales) {
            const line = inv.items.find(i => i.itemId.toString() === item._id.toString());
            if (!line) continue;
            newEntries.push({
                date: inv.invoiceDate,
                itemId: item._id,
                itemCode: item.itemCode,
                itemName: item.itemName,
                itemGroup: item.itemCategory,
                itemType: item.itemType,
                uom: item.uom,
                transactionType: 'SALES_INVOICE',
                voucherType: 'Sales Outward',
                partyId: inv.customerId,
                partyModel: 'Customer',
                partyName: inv.customerName,
                referenceNo: inv.invoiceNumber,
                referenceId: inv._id,
                outQty: line.qty,
                rate: line.rate,
                amount: Math.round(line.qty * line.rate * 100) / 100,
                financialYear: inv.financialYear,
                createdBy: req.user.id
            });
        }
        logs.push(`Pulled ${sales.length} Sales Invoices.`);

        // 3. Fetch Purchase Invoices (Direct)
        const purchases = await PurchaseInvoice.find({
            'items.itemId': item._id,
            status: { $nin: ['Cancelled', 'Draft'] },
            isDeleted: { $ne: true },
            isDirectPurchase: true
        }).session(session);

        for (const inv of purchases) {
            const line = inv.items.find(i => i.itemId.toString() === item._id.toString());
            if (!line) continue;
            if (line.isConsumable || line.purchaseType === 'CONSUMABLE_PURCHASE') continue;
            if (item.itemCategory === 'FINISHED_GOOD' && line.purchaseType !== 'TRADING_PURCHASE') continue;

            newEntries.push({
                date: inv.invoiceDate,
                itemId: item._id,
                itemCode: item.itemCode,
                itemName: item.itemName,
                itemGroup: item.itemCategory,
                itemType: item.itemType,
                uom: item.uom,
                transactionType: 'PURCHASE_INVOICE',
                voucherType: 'Purchase Inward',
                partyId: inv.supplierId,
                partyModel: 'Supplier',
                partyName: inv.supplierName,
                referenceNo: inv.invoiceNumber,
                referenceId: inv._id,
                inQty: line.qty,
                rate: line.rate,
                amount: Math.round(line.qty * line.rate * 100) / 100,
                financialYear: inv.financialYear,
                createdBy: req.user.id
            });
        }
        logs.push(`Pulled ${purchases.length} Purchase Invoices (Direct).`);

        // 4. Fetch GRNs
        const grns = await GRN.find({
            'items.itemId': item._id,
            status: 'Confirmed',
            isDeleted: { $ne: true }
        }).session(session);

        for (const doc of grns) {
            const line = doc.items.find(i => i.itemId.toString() === item._id.toString());
            if (!line) continue;
            if (item.itemCategory === 'FINISHED_GOOD') continue; // Historical GRNs assumed to not be Trading Purchases unless explicitly moved to Direct Invoice
            if (item.itemCategory === 'CONSUMABLE') continue;

            newEntries.push({
                date: doc.grnDate,
                itemId: item._id,
                itemCode: item.itemCode,
                itemName: item.itemName,
                itemGroup: item.itemCategory,
                itemType: item.itemType,
                uom: item.uom,
                transactionType: 'GRN',
                voucherType: 'Purchase Inward',
                partyId: doc.supplierId,
                partyModel: 'Supplier',
                partyName: doc.supplierName,
                referenceNo: doc.grnNumber,
                referenceId: doc._id,
                inQty: line.receivedQty,
                rate: line.rate || 0,
                amount: Math.round(line.receivedQty * (line.rate || 0) * 100) / 100,
                financialYear: doc.financialYear,
                createdBy: req.user.id
            });
        }
        logs.push(`Pulled ${grns.length} GRNs.`);

        // 5. Fetch Work Orders (Output)
        const wos = await WorkOrder.find({
            finishedProductId: item._id,
            status: 'Completed',
            inventorySynced: true
        }).session(session);

        for (const wo of wos) {
            const finalQcStage = wo.stages.find(s => s.seq === 9);
            const qty = (finalQcStage && finalQcStage.outputQty > 0) ? finalQcStage.outputQty : wo.targetQty;
            
            newEntries.push({
                date: wo.updatedAt,
                itemId: item._id,
                itemCode: item.itemCode,
                itemName: item.itemName,
                itemGroup: item.itemCategory,
                itemType: item.itemType,
                uom: item.uom,
                transactionType: 'WO_OUTPUT',
                voucherType: 'Production Inward',
                referenceNo: wo.woNumber,
                referenceId: wo._id,
                inQty: qty,
                rate: item.valuationRate || 0,
                amount: Math.round(qty * (item.valuationRate || 0) * 100) / 100,
                financialYear: wo.financialYear,
                createdBy: req.user.id
            });
        }
        logs.push(`Pulled ${wos.length} Work Order Outputs.`);

        // 6. Fetch Work Orders (Consumption)
        const woConsumption = await WorkOrder.find({
            'materialStatus.itemId': item._id,
            status: 'Completed',
            inventorySynced: true
        }).session(session);

        for (const wo of woConsumption) {
            const mat = wo.materialStatus.find(m => m.itemId.toString() === item._id.toString());
            if (!mat) continue;
            newEntries.push({
                date: wo.updatedAt,
                itemId: item._id,
                itemCode: item.itemCode,
                itemName: item.itemName,
                itemGroup: item.itemCategory,
                itemType: item.itemType,
                uom: item.uom,
                transactionType: 'WO_CONSUMPTION',
                voucherType: 'Production Consumption',
                referenceNo: wo.woNumber,
                referenceId: wo._id,
                outQty: mat.requiredQty,
                rate: item.valuationRate || 0,
                amount: Math.round(mat.requiredQty * (item.valuationRate || 0) * 100) / 100,
                financialYear: wo.financialYear,
                createdBy: req.user.id
            });
        }
        logs.push(`Pulled ${woConsumption.length} Work Order Consumptions.`);

        if (dryRun === 'false' && newEntries.length > 0) {
            newEntries.sort((a, b) => new Date(a.date) - new Date(b.date));
            await StockLedger.insertMany(newEntries, { session });
            logs.push(`Inserted ${newEntries.length} fresh ledger entries.`);

            await recalculateStockLedger(item._id, session);
            logs.push('Recalculated running balances and valuation rates.');
        }

        await session.commitTransaction();
        res.json(new ApiResponse(200, { logs, totalEntries: newEntries.length }, 'Ledger Rebuild Complete'));

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});
