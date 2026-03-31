import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { ProductionPlanning } from '../models/productionPlanning.model.js';
import { BOM } from '../models/bom.model.js';
import { Item } from '../models/item.model.js';
import { StockLedger } from '../models/stockLedger.model.js';
import { WorkOrder } from '../models/workOrder.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getFYFromDate } from '../utils/fyUtils.js';

// ── Help: Generate Planning Number ──────────────────────────────────────────
const generatePlanningNo = async () => {
    const fy = getFYFromDate(new Date());
    const prefix = `PLAN-${fy}-`;
    const lastPlan = await ProductionPlanning.findOne({
        planningNo: { $regex: `^${prefix}` }
    }).sort({ planningNo: -1 }).lean();

    let nextNum = 1;
    if (lastPlan && lastPlan.planningNo) {
        const lastParts = lastPlan.planningNo.split('-');
        const lastSeq = parseInt(lastParts[lastParts.length - 1], 10);
        if (!isNaN(lastSeq)) nextNum = lastSeq + 1;
    }

    return `${prefix}${String(nextNum).padStart(5, '0')}`;
};

// ── Helper: Recursive BOM Explosion ─────────────────────────────────────────
const explodeBOM = async (itemId, requiredQty, exploded = {}, multiplier = 1) => {
    const item = await Item.findById(itemId);
    if (!item) return exploded;

    const bom = await BOM.findOne({ finishedProductId: itemId, status: 'Approved', isDefault: true })
        .populate('components.itemId');
    
    // If no BOM exists for a manufacturable item, treat it as a required item itself (it needs to be purchased or produced)
    if (!bom) {
        const compId = itemId.toString();
        if (!exploded[compId]) {
            exploded[compId] = {
                itemId: item._id,
                itemCode: item.itemCode,
                itemName: item.itemName,
                itemGroup: item.itemGroupName,
                uom: item.uom,
                bomQtyPerUnit: multiplier, 
                totalRequiredQty: 0
            };
        }
        exploded[compId].totalRequiredQty += (requiredQty);
        return exploded;
    }

    for (const component of bom.components) {
        const compId = component.itemId._id.toString();
        const totalNeeded = component.quantity * (requiredQty / (multiplier || 1) * multiplier); 
        // Wait, logic is simpler: requiredQty passed in IS already multi-level.
        const currentNeeded = component.quantity * requiredQty;
        const currentAbsolutePerUnit = component.quantity * multiplier;

        if (component.itemId.isManufacturable) {
            // Recursive call
            await explodeBOM(compId, currentNeeded, exploded, currentAbsolutePerUnit);
        } else {
            // Accumulate leaf node requirements
            if (!exploded[compId]) {
                exploded[compId] = {
                    itemId: component.itemId._id,
                    itemCode: component.itemId.itemCode,
                    itemName: component.itemId.itemName,
                    itemGroup: component.itemId.itemGroupName,
                    uom: component.itemId.uom,
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

// ── Helper: Get Free Stock ──────────────────────────────────────────────────
const getStockInfo = async (itemIds) => {
    // 1. Current Stock from Ledger
    const stockAgg = await StockLedger.aggregate([
        { $match: { itemId: { $in: itemIds.map(id => new mongoose.Types.ObjectId(id)) } } },
        { $group: { _id: "$itemId", total: { $sum: { $subtract: ["$inQty", "$outQty"] } } } }
    ]);
    const stockMap = stockAgg.reduce((acc, s) => {
        acc[s._id.toString()] = s.total;
        return acc;
    }, {});

    // 2. Reserved Stock from Active Work Orders
    const woAgg = await WorkOrder.aggregate([
        { $match: { status: { $in: ['Released', 'In Process', 'WIP – Waiting Material'] } } },
        { $unwind: "$materialStatus" },
        { $match: { "materialStatus.itemId": { $in: itemIds.map(id => new mongoose.Types.ObjectId(id)) } } },
        { $group: { _id: "$materialStatus.itemId", reserved: { $sum: "$materialStatus.shortQty" } } } 
        // Note: Reserved logic can vary. Usually it's (Required - Consumed). 
        // For simplicity, we use (shortQty + already available in WO) or just sum required if not consumed.
    ]);
    
    // Better Reserved: Required Qty of active WOs
    const reservedAgg = await WorkOrder.aggregate([
        { $match: { status: { $in: ['Released', 'In Process', 'WIP – Waiting Material'] } } },
        { $unwind: "$materialStatus" },
        { $match: { "materialStatus.itemId": { $in: itemIds.map(id => new mongoose.Types.ObjectId(id)) } } },
        { $group: { _id: "$materialStatus.itemId", reserved: { $sum: "$materialStatus.requiredQty" } } }
    ]);

    const reservedMap = reservedAgg.reduce((acc, r) => {
        acc[r._id.toString()] = r.reserved;
        return acc;
    }, {});

    return { stockMap, reservedMap };
};

// ────────────────────────────────────────────────────────────────────────────
// POST /production-planning/calculate  – MRP Calculation
// ────────────────────────────────────────────────────────────────────────────
export const calculateMRP = asyncHandler(async (req, res) => {
    const { finishedProductId, plannedQty, bomId } = req.body;

    if (!finishedProductId || !plannedQty) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Product and quantity are required');
    }

    const item = await Item.findById(finishedProductId);
    if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');

    const bom = bomId ? await BOM.findById(bomId) : await BOM.findOne({ finishedProductId, isDefault: true, status: 'Approved' });
    if (!bom) throw new ApiError(httpStatus.BAD_REQUEST, 'No approved default BOM found for this product. Please create and approve a BOM first.');

    // 1. Explode BOM
    const exploded = await explodeBOM(finishedProductId, plannedQty);
    const itemIds = Object.keys(exploded);

    // 2. Fetch Stock & Reserved
    const { stockMap, reservedMap } = await getStockInfo(itemIds);

    // 3. Process Lines
    const lines = [];
    let shortageItems = 0;
    let fullyAvailableItems = 0;
    let maxProductionPossible = plannedQty; 

    for (const id of itemIds) {
        const line = exploded[id];
        const currentStock = stockMap[id] || 0;
        const reservedQty = reservedMap[id] || 0;
        const freeAvailableQty = Math.max(0, currentStock - reservedQty);
        const shortageQty = Math.max(0, line.totalRequiredQty - freeAvailableQty);
        const suggestedOrderQty = shortageQty;
        
        // Feasibility check: how many FG units can THIS item support?
        const itemSupportQty = Math.floor(freeAvailableQty / line.bomQtyPerUnit);
        if (itemSupportQty < maxProductionPossible) {
            maxProductionPossible = itemSupportQty;
        }

        if (shortageQty > 0) shortageItems++;
        else fullyAvailableItems++;

        lines.push({
            ...line,
            currentStock,
            reservedQty,
            freeAvailableQty,
            shortageQty,
            suggestedOrderQty,
            maxProducibleQty: itemSupportQty
        });
    }

    const summary = {
        totalItems: lines.length,
        shortageItems,
        fullyAvailableItems,
        maxProductionPossible,
        estimatedPurchaseValue: 0 // Could be added if item rate is available
    };

    res.json(new ApiResponse(httpStatus.OK, {
        summary,
        lines,
        bomVersion: bom.version,
        bomId: bom._id,
        finishedProductCode: item.itemCode,
        finishedProductName: item.itemName
    }, 'MRP calculation completed'));
});

// ────────────────────────────────────────────────────────────────────────────
// CRUD Operations
// ────────────────────────────────────────────────────────────────────────────

export const createPlanning = asyncHandler(async (req, res) => {
    const planningNo = await generatePlanningNo();
    const planning = await ProductionPlanning.create({
        ...req.body,
        planningNo,
        financialYear: getFYFromDate(new Date()),
        createdBy: req.user.id
    });
    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, planning, 'Planning saved successfully'));
});

export const getPlannings = asyncHandler(async (req, res) => {
    const { search, status, page = 1, limit = 10 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) {
        query.$or = [
            { planningNo: { $regex: search, $options: 'i' } },
            { finishedProductName: { $regex: search, $options: 'i' } }
        ];
    }
    if (req.query.financialYear) query.financialYear = req.query.financialYear;

    const skip = (page - 1) * limit;
    const plannings = await ProductionPlanning.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('finishedProductId', 'itemName itemCode')
        .populate('createdBy', 'name');

    const total = await ProductionPlanning.countDocuments(query);

    res.send(new ApiResponse(httpStatus.OK, {
        plannings,
        total,
        page: Number(page),
        pages: Math.ceil(total / limit)
    }, 'Plannings fetched successfully'));
});

export const getPlanningById = asyncHandler(async (req, res) => {
    const planning = await ProductionPlanning.findById(req.params.id)
        .populate('finishedProductId', 'itemName itemCode')
        .populate('bomId')
        .populate('createdBy', 'name');
    
    if (!planning) throw new ApiError(httpStatus.NOT_FOUND, 'Planning not found');
    res.send(new ApiResponse(httpStatus.OK, planning, 'Planning fetched successfully'));
});

export const updatePlanning = asyncHandler(async (req, res) => {
    const planning = await ProductionPlanning.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!planning) throw new ApiError(httpStatus.NOT_FOUND, 'Planning not found');
    res.send(new ApiResponse(httpStatus.OK, planning, 'Planning updated successfully'));
});

export const deletePlanning = asyncHandler(async (req, res) => {
    const planning = await ProductionPlanning.findByIdAndDelete(req.params.id);
    if (!planning) throw new ApiError(httpStatus.NOT_FOUND, 'Planning not found');
    res.send(new ApiResponse(httpStatus.OK, null, 'Planning deleted successfully'));
});
