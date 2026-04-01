import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { ProductionPlanning } from '../models/productionPlanning.model.js';
import { BOM } from '../models/bom.model.js';
import { Item } from '../models/item.model.js';
import { WorkOrder } from '../models/workOrder.model.js';
import { PurchaseOrder } from '../models/purchaseOrder.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getFYFromDate } from '../utils/fyUtils.js';

// ── Helper: Generate Planning Number ─────────────────────────────────────────
const generatePlanningNo = async () => {
    const fy = getFYFromDate(new Date());
    const prefix = `PLAN-${fy}-`;
    const lastPlan = await ProductionPlanning.findOne({
        planningNo: { $regex: `^${prefix}` }
    }).sort({ planningNo: -1 }).lean();

    let nextNum = 1;
    if (lastPlan?.planningNo) {
        const parts = lastPlan.planningNo.split('-');
        const lastSeq = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastSeq)) nextNum = lastSeq + 1;
    }
    return `${prefix}${String(nextNum).padStart(5, '0')}`;
};

// ── Helper: Recursive BOM Explosion ──────────────────────────────────────────
// Returns a map of { itemId -> { itemId, itemCode, itemName, uom, bomQtyPerUnit, totalRequiredQty } }
const explodeBOM = async (itemId, requiredQty, exploded = {}, multiplier = 1) => {
    const item = await Item.findById(itemId).lean();
    if (!item) return exploded;

    const bom = await BOM.findOne({ finishedProductId: itemId, status: 'Approved', isDefault: true })
        .populate('components.itemId').lean();

    if (!bom) {
        const compId = itemId.toString();
        if (!exploded[compId]) {
            exploded[compId] = {
                itemId: item._id,
                itemCode: item.itemCode,
                itemName: item.itemName,
                itemGroup: item.itemGroupName || '',
                uom: item.uom || 'NOS',
                bomQtyPerUnit: multiplier,
                totalRequiredQty: 0
            };
        }
        exploded[compId].totalRequiredQty += requiredQty;
        return exploded;
    }

    for (const component of bom.components) {
        const comp = component.itemId;
        if (!comp) continue;
        const compId = comp._id.toString();
        const currentNeeded = component.quantity * requiredQty;
        const currentAbsolutePerUnit = component.quantity * multiplier;

        if (comp.isManufacturable) {
            await explodeBOM(compId, currentNeeded, exploded, currentAbsolutePerUnit);
        } else {
            if (!exploded[compId]) {
                exploded[compId] = {
                    itemId: comp._id,
                    itemCode: comp.itemCode,
                    itemName: comp.itemName,
                    itemGroup: comp.itemGroupName || '',
                    uom: comp.uom || 'NOS',
                    bomQtyPerUnit: 0,
                    totalRequiredQty: 0
                };
            }
            exploded[compId].bomQtyPerUnit += currentAbsolutePerUnit;
            exploded[compId].totalRequiredQty += currentNeeded;
        }
    }
    return exploded;
};

// ── Helper: Get Current Stock from Item Master ────────────────────────────────
// Uses item.currentStock as the authoritative source (Item Master is source of truth)
// Also fetches reserved qty from active work orders
const getStockData = async (itemIds) => {
    if (!itemIds.length) return { stockMap: {}, reservedMap: {} };

    const validIds = itemIds.filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));

    // Pull currentStock directly from Item Master — this is the authoritative source
    const items = await Item.find({ _id: { $in: validIds } })
        .select('_id itemCode currentStock valuationRate').lean();

    const stockMap = {};
    items.forEach(item => {
        stockMap[item._id.toString()] = {
            currentStock: item.currentStock || 0,
            lastPurchaseRate: item.valuationRate || 0
        };
    });

    // Reserved qty from active work orders
    const reservedAgg = await WorkOrder.aggregate([
        { $match: { status: { $in: ['Released', 'In Process', 'WIP – Waiting Material'] } } },
        { $unwind: '$materialStatus' },
        { $match: { 'materialStatus.itemId': { $in: validIds } } },
        { $group: { _id: '$materialStatus.itemId', reserved: { $sum: '$materialStatus.requiredQty' } } }
    ]);

    const reservedMap = {};
    reservedAgg.forEach(r => { reservedMap[r._id.toString()] = r.reserved; });

    return { stockMap, reservedMap };
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /production-planning/calculate-multi  – Multi-Product MRP Calculation
// ─────────────────────────────────────────────────────────────────────────────
export const calculateMultiMRP = asyncHandler(async (req, res) => {
    const { productLines, warehouse } = req.body;
    // productLines = [{ finishedProductId, plannedQty, bomId? }, ...]

    if (!productLines || !Array.isArray(productLines) || productLines.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'At least one product line is required');
    }

    // Validate all products first
    const validatedLines = [];
    for (const pl of productLines) {
        if (!pl.finishedProductId || !pl.plannedQty) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Each product line must have a product and planned quantity');
        }
        const item = await Item.findById(pl.finishedProductId).lean();
        if (!item) throw new ApiError(httpStatus.NOT_FOUND, `Product not found: ${pl.finishedProductId}`);

        const bom = pl.bomId
            ? await BOM.findById(pl.bomId).lean()
            : await BOM.findOne({ finishedProductId: pl.finishedProductId, isDefault: true, status: 'Approved' }).lean();

        if (!bom) throw new ApiError(httpStatus.BAD_REQUEST, `No approved BOM found for: ${item.itemCode}`);

        validatedLines.push({ item, bom, plannedQty: Number(pl.plannedQty), bomId: bom._id });
    }

    // ── Step 1: Explode BOM for each product and accumulate combined requirements
    // combinedExploded = { itemId: { ...itemInfo, totalRequiredQty, productWiseBreakdown[] } }
    const combinedExploded = {};

    for (const vl of validatedLines) {
        const { item, bom, plannedQty } = vl;
        const singleExploded = await explodeBOM(item._id.toString(), plannedQty);

        for (const [itemId, lineData] of Object.entries(singleExploded)) {
            if (!combinedExploded[itemId]) {
                combinedExploded[itemId] = {
                    ...lineData,
                    totalRequiredQty: 0,
                    productWiseBreakdown: [],
                    usedInProducts: []
                };
            }
            combinedExploded[itemId].totalRequiredQty += lineData.totalRequiredQty;
            combinedExploded[itemId].usedInProducts.push(item.itemCode);
            combinedExploded[itemId].productWiseBreakdown.push({
                finishedProductId: item._id,
                finishedProductCode: item.itemCode,
                finishedProductName: item.itemName,
                bomQtyPerUnit: lineData.bomQtyPerUnit,
                requiredQty: lineData.totalRequiredQty
            });
        }
    }

    const allItemIds = Object.keys(combinedExploded);

    // ── Step 2: Pull stock data from Item Master
    const { stockMap, reservedMap } = await getStockData(allItemIds);

    // ── Step 3: Calculate shortage for each combined material item
    const lines = [];
    let shortageItems = 0;
    let fullyAvailableItems = 0;

    for (const [itemId, data] of Object.entries(combinedExploded)) {
        const stockInfo = stockMap[itemId] || { currentStock: 0, lastPurchaseRate: 0 };
        const currentStock = stockInfo.currentStock;
        const reservedQty = reservedMap[itemId] || 0;
        const freeAvailableQty = Math.max(0, currentStock - reservedQty);
        const totalRequiredQty = data.totalRequiredQty;

        // FORMULA: Shortage = Total Required - Free Available (0 if stock > required)
        const shortageQty = Math.max(0, totalRequiredQty - freeAvailableQty);
        const suggestedOrderQty = shortageQty;

        const estimatedPurchaseValue = shortageQty * stockInfo.lastPurchaseRate;

        if (shortageQty > 0) shortageItems++;
        else fullyAvailableItems++;

        lines.push({
            itemId: data.itemId,
            itemCode: data.itemCode,
            itemName: data.itemName,
            itemGroup: data.itemGroup,
            uom: data.uom,
            usedInProducts: [...new Set(data.usedInProducts)],
            productWiseBreakdown: data.productWiseBreakdown,
            totalRequiredQty,
            currentStock,
            reservedQty,
            freeAvailableQty,
            shortageQty,
            suggestedOrderQty,
            lastPurchaseRate: stockInfo.lastPurchaseRate,
            estimatedPurchaseValue
        });
    }

    // Sort: shortage items first
    lines.sort((a, b) => b.shortageQty - a.shortageQty);

    const totalShortageValue = lines.reduce((s, l) => s + l.estimatedPurchaseValue, 0);
    const totalItems = lines.length;
    const readinessPercent = totalItems > 0 ? Math.round((fullyAvailableItems / totalItems) * 100) : 0;

    const summary = {
        totalSelectedProducts: validatedLines.length,
        totalItems,
        shortageItems,
        fullyAvailableItems,
        estimatedShortageValue: Math.round(totalShortageValue * 100) / 100,
        readinessPercent
    };

    const productSummary = validatedLines.map(vl => ({
        finishedProductId: vl.item._id,
        finishedProductCode: vl.item.itemCode,
        finishedProductName: vl.item.itemName,
        bomId: vl.bom._id,
        bomVersion: vl.bom.version,
        plannedQty: vl.plannedQty
    }));

    res.json(new ApiResponse(httpStatus.OK, { summary, lines, productSummary }, 'Multi-product MRP calculation completed'));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /production-planning/calculate  – Single-Product MRP (backward-compat)
// ─────────────────────────────────────────────────────────────────────────────
export const calculateMRP = asyncHandler(async (req, res) => {
    const { finishedProductId, plannedQty, bomId, warehouse } = req.body;

    if (!finishedProductId || !plannedQty) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Product and quantity are required');
    }

    // Delegate to multi-product with single line
    req.body = { productLines: [{ finishedProductId, plannedQty, bomId }], warehouse };
    return calculateMultiMRP(req, res);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /production-planning/:id/convert-to-po  – Draft PO from Shortage
// ─────────────────────────────────────────────────────────────────────────────
export const convertToPO = asyncHandler(async (req, res) => {
    const { selectedItemIds, supplierId, supplierName, warehouse, expectedDeliveryDate } = req.body;
    const { id: planningId } = req.params;

    const planning = await ProductionPlanning.findById(planningId).lean();
    if (!planning) throw new ApiError(httpStatus.NOT_FOUND, 'Planning not found');

    // Filter shortage lines — use selectedItemIds if provided, else all shortage lines
    let shortageLines = planning.lines.filter(l => l.shortageQty > 0);
    if (selectedItemIds && selectedItemIds.length > 0) {
        shortageLines = shortageLines.filter(l => selectedItemIds.includes(l.itemId?.toString()));
    }

    if (shortageLines.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'No shortage items to convert to PO');
    }

    // Build PO items
    const poItems = shortageLines.map(line => ({
        itemId: line.itemId,
        itemCode: line.itemCode,
        itemName: line.itemName,
        uom: line.uom,
        orderedQty: line.suggestedOrderQty,
        pendingQty: line.suggestedOrderQty,
        rate: line.lastPurchaseRate || 0,
        amount: (line.suggestedOrderQty * (line.lastPurchaseRate || 0)),
        totalAmount: (line.suggestedOrderQty * (line.lastPurchaseRate || 0)),
        bomRef: planning.planningNo
    }));

    const subTotal = poItems.reduce((s, i) => s + i.amount, 0);

    // Create draft PO — supplierId is required by PO model but may be missing
    // If no supplier provided, we need a placeholder approach
    if (!supplierId) {
        // Return the shortage data for manual PO creation
        return res.json(new ApiResponse(httpStatus.OK, {
            shortageItems: shortageLines,
            message: 'No supplier selected. Use this data to create PO manually.',
            poItems
        }, 'Shortage export ready'));
    }

    const po = await PurchaseOrder.create({
        poDate: new Date(),
        supplierId,
        supplierName: supplierName || '',
        warehouse: planning.warehouse || warehouse || 'Main Store',
        expectedDeliveryDate: expectedDeliveryDate || planning.requiredDate,
        status: 'Draft',
        remarks: `Created from Production Planning: ${planning.planningNo}`,
        items: poItems,
        subTotal,
        grandTotal: subTotal,
        financialYear: planning.financialYear,
        createdBy: req.user?.id
    });

    // Update planning status
    await ProductionPlanning.findByIdAndUpdate(planningId, {
        status: 'Purchase Pending',
        updatedBy: req.user?.id
    });

    res.json(new ApiResponse(httpStatus.CREATED, po, 'Draft Purchase Order created successfully'));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /production-planning/export-shortage  – Export shortage data as JSON
// Frontend will convert to XLSX using the xlsx library
// ─────────────────────────────────────────────────────────────────────────────
export const exportShortage = asyncHandler(async (req, res) => {
    const { lines, planningNo } = req.body;

    if (!lines || !Array.isArray(lines)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Lines data required for export');
    }

    const shortageLines = lines.filter(l => l.shortageQty > 0);

    const exportData = shortageLines.map((line, idx) => ({
        'Sr No': idx + 1,
        'Item Code': line.itemCode,
        'Item Name': line.itemName,
        'UOM': line.uom,
        'Used In Products': Array.isArray(line.usedInProducts) ? line.usedInProducts.join(', ') : '',
        'Total Required Qty': line.totalRequiredQty,
        'Current Stock': line.currentStock,
        'Reserved Qty': line.reservedQty,
        'Free Available Qty': line.freeAvailableQty,
        'Shortage Qty': line.shortageQty,
        'Suggested Order Qty': line.suggestedOrderQty,
        'Last Purchase Rate': line.lastPurchaseRate || 0,
        'Estimated Value': line.estimatedPurchaseValue || 0
    }));

    res.json(new ApiResponse(httpStatus.OK, {
        exportData,
        planningNo,
        totalShortageItems: shortageLines.length,
        totalEstimatedValue: shortageLines.reduce((s, l) => s + (l.estimatedPurchaseValue || 0), 0)
    }, 'Shortage export data ready'));
});

// ─────────────────────────────────────────────────────────────────────────────
// CRUD Operations
// ─────────────────────────────────────────────────────────────────────────────

export const createPlanning = asyncHandler(async (req, res) => {
    const planningNo = await generatePlanningNo();
    const planning = await ProductionPlanning.create({
        ...req.body,
        planningNo,
        financialYear: getFYFromDate(new Date()),
        createdBy: req.user?.id
    });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, planning, 'Planning saved successfully'));
});

export const getPlannings = asyncHandler(async (req, res) => {
    const { search, status, page = 1, limit = 10, financialYear } = req.query;
    const query = {};
    if (status) query.status = status;
    if (financialYear) query.financialYear = financialYear;
    if (search) {
        query.$or = [
            { planningNo: { $regex: search, $options: 'i' } },
            { finishedProductName: { $regex: search, $options: 'i' } },
            { 'productLines.finishedProductName': { $regex: search, $options: 'i' } }
        ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const plannings = await ProductionPlanning.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('-lines') // exclude heavy lines array from list
        .lean();

    const total = await ProductionPlanning.countDocuments(query);

    res.send(new ApiResponse(httpStatus.OK, {
        plannings,
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit))
    }, 'Plannings fetched successfully'));
});

export const getPlanningById = asyncHandler(async (req, res) => {
    const planning = await ProductionPlanning.findById(req.params.id)
        .populate('productLines.finishedProductId', 'itemName itemCode')
        .populate('productLines.bomId', 'version')
        .populate('createdBy', 'name')
        .lean();

    if (!planning) throw new ApiError(httpStatus.NOT_FOUND, 'Planning not found');
    res.send(new ApiResponse(httpStatus.OK, planning, 'Planning fetched successfully'));
});

export const updatePlanning = asyncHandler(async (req, res) => {
    const planning = await ProductionPlanning.findByIdAndUpdate(
        req.params.id,
        { ...req.body, updatedBy: req.user?.id },
        { new: true, runValidators: true }
    );
    if (!planning) throw new ApiError(httpStatus.NOT_FOUND, 'Planning not found');
    res.send(new ApiResponse(httpStatus.OK, planning, 'Planning updated successfully'));
});

export const deletePlanning = asyncHandler(async (req, res) => {
    const planning = await ProductionPlanning.findByIdAndDelete(req.params.id);
    if (!planning) throw new ApiError(httpStatus.NOT_FOUND, 'Planning not found');
    res.send(new ApiResponse(httpStatus.OK, null, 'Planning deleted successfully'));
});
