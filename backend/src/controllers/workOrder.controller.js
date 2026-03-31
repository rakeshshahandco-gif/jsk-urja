import { WorkOrder, PRODUCTION_STAGES } from '../models/workOrder.model.js';
import { BOM } from '../models/bom.model.js';
import { Item } from '../models/item.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import {
    createWorkOrderSchema,
    updateWorkOrderSchema,
    updateStageSchema,
    updateMaterialStatusSchema,
    addProductionLogSchema,
} from '../validations/workOrder.validation.js';

// ── Auto-generate WO Number ──────────────────────────────────────────────────
const generateWoNumber = async () => {
    const fy = getFYFromDate(new Date());
    const prefix = `WO-${fy}-`;

    // Find the latest WO for this year by sorting numerically on the suffix
    const lastWo = await WorkOrder.findOne({
        woNumber: { $regex: `^${prefix}` }
    }).sort({ woNumber: -1 }).lean();

    let nextNum = 1;
    if (lastWo && lastWo.woNumber) {
        const lastParts = lastWo.woNumber.split('-');
        const lastSeq = parseInt(lastParts[lastParts.length - 1], 10);
        if (!isNaN(lastSeq)) {
            nextNum = lastSeq + 1;
        }
    }

    const padded = String(nextNum).padStart(5, '0');
    return `${prefix}${padded}`;
};

// ── Derive WO-level status from stages ──────────────────────────────────────
const deriveWoStatus = (stages, currentStatus) => {
    const allDone = stages.every(s => s.status === 'Completed');
    const anyRunning = stages.some(s => s.status === 'Running');
    const anyFailed = stages.some(s => s.status === 'Failed' || s.status === 'QC Hold');

    if (currentStatus === 'Draft' || currentStatus === 'On Hold') return currentStatus;
    if (allDone) return 'Completed';
    if (anyRunning) return 'In Process';
    if (anyFailed) return 'In Process';
    if (stages.some(s => s.status !== 'Not Started')) return 'In Process';
    return currentStatus; // stay as Released / In Process
};

// ────────────────────────────────────────────────────────────────────────────
// POST /work-orders  – Create Work Order
// ────────────────────────────────────────────────────────────────────────────
export const createWorkOrder = asyncHandler(async (req, res) => {
    const { error, value } = createWorkOrderSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    // Validate BOM exists
    const bom = await BOM.findById(value.bomId).populate('finishedProductId');
    if (!bom) throw new ApiError(404, 'BOM not found');

    // Use manual WO number if provided, otherwise auto-generate
    const woNumber = value.woNumber?.trim() || await generateWoNumber();

    // Check if manually provided WO number already exists
    if (value.woNumber) {
        const existing = await WorkOrder.findOne({ woNumber });
        if (existing) throw new ApiError(400, `Work Order Number ${woNumber} already exists`);
    }

    // Build initial stages from PRODUCTION_STAGES constant
    const stages = PRODUCTION_STAGES.map(s => ({
        seq: s.seq,
        stageName: s.stageName,
        isQcGate: s.isQcGate,
        isTestGate: s.isTestGate,
        status: 'Not Started',
        // Pre-populate checklist items for QC/Testing gates
        checklist: s.isQcGate ? getDefaultChecklist(s.stageName) : [],
    }));

    // Fetch current stock and itemType for all components
    const itemIds = (bom.components || []).map(c => c.itemId);
    const items = await Item.find({ _id: { $in: itemIds } }).select('_id currentStock itemType');
    const itemMap = items.reduce((acc, item) => {
        acc[item._id.toString()] = {
            currentStock: item.currentStock || 0,
            itemType: item.itemType || 'OTHER'
        };
        return acc;
    }, {});

    // Build material status from BOM components
    const materialStatus = (bom.components || []).map(c => {
        const requiredQty = c.quantity * value.targetQty;
        const itemInfo = itemMap[c.itemId.toString()] || { currentStock: 0, itemType: 'OTHER' };
        const availableStock = itemInfo.currentStock;
        const shortQty = Math.max(0, requiredQty - availableStock);

        return {
            itemId: c.itemId,
            itemCode: c.itemCode || '',
            itemName: c.itemName || '',
            itemType: itemInfo.itemType,
            uom: c.uom || '',
            requiredQty,
            availableStock,
            reservedQty: 0,
            shortQty,
            isMandatory: c.isMandatory !== undefined ? c.isMandatory : true,
            isCritical: c.isCritical || false,
            alternateAvailable: !!c.alternateItem,
            consumptionStage: c.consumptionStage || '',
            procurementStatus: 'Not Ordered',
        };
    });

    const wo = await WorkOrder.create({
        woNumber,
        bomId: bom._id,
        finishedProductId: bom.finishedProductId?._id,
        finishedProductName: bom.finishedProductId?.name || '',
        bomVersion: bom.version,
        targetQty: value.targetQty,
        priority: value.priority,
        plannedStart: value.plannedStart,
        plannedEnd: value.plannedEnd,
        supervisor: value.supervisor,
        remarks: value.remarks,
        stages,
        materialStatus,
        financialYear: value.financialYear || getFYFromDate(value.plannedStart || new Date()),
        createdBy: req.user._id,
    });

    res.status(201).json(new ApiResponse(201, wo, 'Work Order created successfully'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /work-orders  – List Work Orders
// ────────────────────────────────────────────────────────────────────────────
export const getWorkOrders = asyncHandler(async (req, res) => {
    const { status, priority, search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (search) {
        query.$or = [
            { woNumber: { $regex: search, $options: 'i' } },
            { finishedProductName: { $regex: search, $options: 'i' } },
            { supervisor: { $regex: search, $options: 'i' } },
        ];
    }
    if (req.query.financialYear) query.financialYear = req.query.financialYear;

    const skip = (Number(page) - 1) * Number(limit);
    const total = await WorkOrder.countDocuments(query);
    const wos = await WorkOrder.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('finishedProductId', 'name itemCode')
        .populate('createdBy', 'name');

    res.json(new ApiResponse(200, {
        workOrders: wos,
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
    }, 'Work Orders fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /work-orders/:id  – Get single WO
// ────────────────────────────────────────────────────────────────────────────
export const getWorkOrderById = asyncHandler(async (req, res) => {
    const wo = await WorkOrder.findById(req.params.id)
        .populate('bomId', 'bomNumber version')
        .populate('finishedProductId', 'name itemCode')
        .populate('createdBy', 'name');

    if (!wo) throw new ApiError(404, 'Work Order not found');
    res.json(new ApiResponse(200, wo, 'Work Order fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// PUT /work-orders/:id  – Update WO header
// ────────────────────────────────────────────────────────────────────────────
export const updateWorkOrder = asyncHandler(async (req, res) => {
    const { error, value } = updateWorkOrderSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const wo = await WorkOrder.findById(req.params.id);
    if (!wo) throw new ApiError(404, 'Work Order not found');
    if (wo.status === 'Closed') throw new ApiError(400, 'Closed WO cannot be edited');

    // Prevent modifying targetQty if production has already started
    if (value.targetQty && value.targetQty !== wo.targetQty) {
        const hasStarted = wo.stages.some(s => s.productionLogs && s.productionLogs.length > 0);
        if (hasStarted) throw new ApiError(400, 'Cannot modify Target Qty. Production has already started.');
    }

    Object.assign(wo, value);
    wo.updatedBy = req.user._id;
    await wo.save();

    res.json(new ApiResponse(200, wo, 'Work Order updated'));
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /work-orders/:id/release  – Draft → Released
// ────────────────────────────────────────────────────────────────────────────
export const releaseWorkOrder = asyncHandler(async (req, res) => {
    const wo = await WorkOrder.findById(req.params.id);
    if (!wo) throw new ApiError(404, 'Work Order not found');
    if (wo.status !== 'Draft') throw new ApiError(400, 'Only Draft WOs can be released');

    // ── Material Check before Release ───────────────────────────────────────
    const mandatoryShortages = wo.materialStatus.filter(m => m.isMandatory && m.shortQty > 0);
    if (mandatoryShortages.length > 0) {
        const itemNames = mandatoryShortages.map(m => m.itemName).join(', ');
        throw new ApiError(400, `Cannot release WO due to mandatory material shortage: ${itemNames}. Please restock or untick them as mandatory to proceed.`);
    }

    wo.status = 'Released';
    wo.updatedBy = req.user._id;
    await wo.save();

    res.json(new ApiResponse(200, wo, 'Work Order released'));
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /work-orders/:id/stages/:seq  – Update a production stage
// ────────────────────────────────────────────────────────────────────────────
export const updateStage = asyncHandler(async (req, res) => {
    const { error, value } = updateStageSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const wo = await WorkOrder.findById(req.params.id);
    if (!wo) throw new ApiError(404, 'Work Order not found');
    if (!['Released', 'In Process', 'WIP – Waiting Material'].includes(wo.status)) {
        throw new ApiError(400, `WO in status "${wo.status}" cannot have stages updated`);
    }

    const seq = Number(req.params.seq);
    const stage = wo.stages.find(s => s.seq === seq);
    if (!stage) throw new ApiError(404, `Stage ${seq} not found`);

    // Assign values
    Object.assign(stage, value);

    // Auto-calculate aggregated quantities from productionLogs if provided
    if (value.productionLogs !== undefined) {
        stage.inputQty = value.productionLogs.reduce((sum, log) => sum + (log.inputQty || 0), 0);
        stage.outputQty = value.productionLogs.reduce((sum, log) => sum + (log.outputQty || 0), 0);
        stage.reworkQty = value.productionLogs.reduce((sum, log) => sum + (log.reworkQty || 0), 0);
        stage.rejectionQty = value.productionLogs.reduce((sum, log) => sum + (log.rejectionQty || 0), 0);

        // Stage Dependency Math:
        const maxAllowed = getMaxAllowedOutput(wo, stage);
        if (stage.outputQty > maxAllowed) {
            if (stage.seq === 1) {
                throw new ApiError(400, `Cannot exceed Target Qty (${wo.targetQty}). Total is ${stage.outputQty}.`);
            } else {
                throw new ApiError(400, `Cannot exceed Previous Stage Output (${maxAllowed}). Total is ${stage.outputQty}.`);
            }
        }
    }

    // ── Shortage gate: prevent Completed on Final QC (seq 9) if mandatory shortage ──
    if (seq === 9 && value.status === 'Completed') {
        const mandatoryShortages = wo.materialStatus.filter(
            m => m.isMandatory && m.shortQty > 0
        );
        if (mandatoryShortages.length > 0) {
            stage.status = 'QC Hold';
            wo.status = 'WIP – Waiting Material';
            wo.wip.isOnHold = true;
            wo.wip.holdReason = 'Mandatory material shortage – cannot complete FG';
            wo.wip.missingMandatoryItems = mandatoryShortages.map(m => m.itemName);
            await wo.save();
            return res.status(200).json(new ApiResponse(200, wo,
                'Final QC blocked: mandatory material shortage. WO set to WIP – Waiting Material.'));
        }
    }

    // Derive overall WO status
    if (wo.status !== 'On Hold') {
        wo.status = deriveWoStatus(wo.stages, wo.status);
        if (wo.status === 'In Process' && !wo.actualStart) wo.actualStart = new Date();
        if (wo.status === 'Completed') wo.actualEnd = new Date();
    }

    wo.updatedBy = req.user._id;
    await wo.save();
    res.json(new ApiResponse(200, wo, `Stage "${stage.stageName}" updated`));
});

// ────────────────────────────────────────────────────────────────────────────
// Helper: Get Max Allowed Output for a Stage (Dependency logic)
// ────────────────────────────────────────────────────────────────────────────
const getMaxAllowedOutput = (wo, currentStage) => {
    if (currentStage.seq === 1) return wo.targetQty;
    const prevStage = wo.stages.find(s => s.seq === currentStage.seq - 1);
    return prevStage ? prevStage.outputQty : wo.targetQty;
};

// ────────────────────────────────────────────────────────────────────────────
// Helper: Get Pending Qty for a Stage
// ────────────────────────────────────────────────────────────────────────────
const getPendingQty = (wo, currentStage) => {
    const maxAllowed = getMaxAllowedOutput(wo, currentStage);
    return Math.max(0, maxAllowed - currentStage.outputQty);
};

// ────────────────────────────────────────────────────────────────────────────
// Helper: Recalculate Stage Quantities and Status
// ────────────────────────────────────────────────────────────────────────────
const recalculateStageAndWo = (wo, stage) => {
    // Recalculate Totals from logs
    stage.inputQty = stage.productionLogs.reduce((sum, log) => sum + (log.inputQty || 0), 0);
    stage.outputQty = stage.productionLogs.reduce((sum, log) => sum + (log.outputQty || 0), 0);
    stage.reworkQty = stage.productionLogs.reduce((sum, log) => sum + (log.reworkQty || 0), 0);
    stage.rejectionQty = stage.productionLogs.reduce((sum, log) => sum + (log.rejectionQty || 0), 0);

    // If it's a QC gate, verify the logs also have QC-specific fields summed up correctly
    if (stage.isQcGate) {
        // These can be useful for granular reporting in the UI
        const totalPassed = stage.productionLogs.reduce((sum, log) => sum + (log.qcPassedQty || 0), 0);
        const totalRejected = stage.productionLogs.reduce((sum, log) => sum + (log.qcRejectedQty || 0), 0);
        const totalRework = stage.productionLogs.reduce((sum, log) => sum + (log.qcReworkQty || 0), 0);

        // Ensure stage-level aggregates match log-level QC sums if they were used
        if (totalPassed + totalRejected + totalRework > 0) {
            stage.outputQty = totalPassed + totalRejected + totalRework;
            stage.rejectionQty = totalRejected;
            stage.reworkQty = totalRework;
        }
    }

    // Auto Status Logic
    const maxAllowed = getMaxAllowedOutput(wo, stage);
    if (stage.outputQty >= maxAllowed && maxAllowed > 0) {
        stage.status = 'Completed';
    } else if (stage.outputQty > 0 || stage.inputQty > 0) {
        stage.status = 'Running';
    } else {
        stage.status = 'Not Started';
    }

    // ── Shortage gate: prevent Completed on Final QC (seq 9) if mandatory shortage ──
    if (stage.seq === 9 && stage.status === 'Completed') {
        const mandatoryShortages = wo.materialStatus.filter(
            m => m.isMandatory && m.shortQty > 0
        );
        if (mandatoryShortages.length > 0) {
            stage.status = 'QC Hold';
            wo.status = 'WIP – Waiting Material';
            wo.wip.isOnHold = true;
            wo.wip.holdReason = 'Mandatory material shortage – cannot complete FG';
            wo.wip.missingMandatoryItems = mandatoryShortages.map(m => m.itemName);
            return { blocked: true };
        }
    }

    // Derive overall WO status
    if (wo.status !== 'On Hold') {
        wo.status = deriveWoStatus(wo.stages, wo.status);
        if (wo.status === 'In Process' && !wo.actualStart) wo.actualStart = new Date();
        if (wo.status === 'Completed') wo.actualEnd = new Date();
    }
    return { blocked: false };
};

// ────────────────────────────────────────────────────────────────────────────
// POST /work-orders/:id/stages/:seq/production-logs – Add Production Log
// ────────────────────────────────────────────────────────────────────────────
export const addProductionLog = asyncHandler(async (req, res) => {
    const { error, value } = addProductionLogSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const wo = await WorkOrder.findById(req.params.id);
    if (!wo) throw new ApiError(404, 'Work Order not found');
    if (!['Released', 'In Process', 'WIP – Waiting Material'].includes(wo.status)) {
        throw new ApiError(400, `WO in status "${wo.status}" cannot have production logged`);
    }

    const seq = Number(req.params.seq);
    const stage = wo.stages.find(s => s.seq === seq);
    if (!stage) throw new ApiError(404, `Stage ${seq} not found`);

    // ── 1. STAGE-SPECIFIC MATERIAL DEPENDENCY ────────────────────────────────
    if (seq === 1) { // PCB Stage
        const pcbShortages = wo.materialStatus.filter(m => m.itemType === 'PCB' && m.shortQty > 0);
        if (pcbShortages.length > 0) {
            throw new ApiError(400, `PCB Stage blocked: Missing PCB items (${pcbShortages.map(m => m.itemName).join(', ')}).`);
        }
    }

    // Auto-populate missing components for Pick & Place and TH Mounting
    if (seq === 2 || seq === 3) { // Pick & Place or TH Mounting
        const relevantType = seq === 2 ? 'SMD' : 'TH';
        const shortages = wo.materialStatus.filter(m => m.itemType === relevantType && m.shortQty > 0);

        if (shortages.length > 0) {
            // If the user didn't provide missingComponents, auto-identify them from shortages
            if (!value.missingComponents || value.missingComponents.length === 0) {
                value.missingComponents = shortages.map(s => ({
                    itemId: s.itemId,
                    itemCode: s.itemCode,
                    itemName: s.itemName,
                    quantity: s.shortQty,
                    remarks: 'Auto-recorded shortage during production logging'
                }));
            }
        }
    }

    // ── 2. QC RESULT AGGREGATION ─────────────────────────────────────────────
    // For QC stages (7: 1st QC, 9: Final QC), outputQty should be the sum of results if not provided
    if (stage.isQcGate) {
        const passed = value.qcPassedQty || 0;
        const rejected = value.qcRejectedQty || 0;
        const rework = value.qcReworkQty || 0;
        const totalOutput = passed + rejected + rework;

        if (totalOutput > 0) {
            value.outputQty = totalOutput;
            value.reworkQty = rework;
            value.rejectionQty = rejected;
        }
    }

    // ── 3. SEQUENTIAL QUANTITY LIMITS ────────────────────────────────────────
    const expectedOutput = stage.outputQty + (value.outputQty || 0);
    const maxAllowed = getMaxAllowedOutput(wo, stage);
    if (expectedOutput > maxAllowed) {
        if (stage.seq === 1) {
            throw new ApiError(400, `Cannot exceed Target Qty (${wo.targetQty}). Pending: ${wo.targetQty - stage.outputQty}.`);
        } else {
            const prevStage = wo.stages.find(s => s.seq === seq - 1);
            throw new ApiError(400, `Cannot exceed Previous Stage ("${prevStage?.stageName}") Output (${maxAllowed}). Pending: ${maxAllowed - stage.outputQty}.`);
        }
    }

    // Add Log
    stage.productionLogs.push(value);

    // Recalculate Totals & Status
    const { blocked } = recalculateStageAndWo(wo, stage);

    // ── 4. FG COMPLETION LOGIC ───────────────────────────────────────────────
    // If Final QC (seq 9) is completed, update FG stock if needed (or hand over to inventory controller)
    // Note: Inventory update logic would typically be in a separate service, but we handle the status here.

    wo.updatedBy = req.user._id;
    await wo.save();

    const responseMsg = blocked
        ? 'Production logged, but Final QC blocked due to material shortage'
        : `Production logged successfully for Stage "${stage.stageName}"`;

    res.status(201).json(new ApiResponse(201, wo, responseMsg));
});

// ────────────────────────────────────────────────────────────────────────────
// DELETE /work-orders/:id/stages/:seq/production-logs/:logId – Delete Prod Log
// ────────────────────────────────────────────────────────────────────────────
export const deleteProductionLog = asyncHandler(async (req, res) => {
    const wo = await WorkOrder.findById(req.params.id);
    if (!wo) throw new ApiError(404, 'Work Order not found');
    if (!['Released', 'In Process', 'WIP – Waiting Material'].includes(wo.status)) {
        throw new ApiError(400, `WO in status "${wo.status}" cannot be modified`);
    }

    const seq = Number(req.params.seq);
    const stage = wo.stages.find(s => s.seq === seq);
    if (!stage) throw new ApiError(404, `Stage ${seq} not found`);

    const logIndex = stage.productionLogs.findIndex(l => l._id.toString() === req.params.logId);
    if (logIndex === -1) throw new ApiError(404, 'Production Log not found');

    stage.productionLogs.splice(logIndex, 1);

    // Recalculate
    recalculateStageAndWo(wo, stage);

    wo.updatedBy = req.user._id;
    await wo.save();

    res.json(new ApiResponse(200, wo, 'Production Log deleted and quantities recalculated'));
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /work-orders/:id/material-status  – Update material procurement status
// ────────────────────────────────────────────────────────────────────────────
export const updateMaterialStatus = asyncHandler(async (req, res) => {
    const { error, value } = updateMaterialStatusSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const wo = await WorkOrder.findById(req.params.id);
    if (!wo) throw new ApiError(404, 'Work Order not found');

    for (const upd of value.materialUpdates) {
        const mat = wo.materialStatus.id(upd.materialId);
        if (!mat) continue;
        Object.assign(mat, {
            shortQty: upd.shortQty ?? mat.shortQty,
            availableStock: upd.availableStock ?? mat.availableStock,
            procurementStatus: upd.procurementStatus ?? mat.procurementStatus,
            isMandatory: upd.isMandatory ?? mat.isMandatory,
            alternateAvailable: upd.alternateAvailable ?? mat.alternateAvailable,
            remarks: upd.remarks ?? mat.remarks,
        });
    }

    if (value.eta) wo.wip.eta = value.eta;

    // Auto clear WIP hold if all mandatory shortages resolved
    const remainingShortages = wo.materialStatus.filter(m => m.isMandatory && m.shortQty > 0);
    if (remainingShortages.length === 0 && wo.status === 'WIP – Waiting Material') {
        wo.wip.isOnHold = false;
        wo.wip.holdReason = '';
        wo.wip.missingMandatoryItems = [];
        wo.status = 'In Process';
    }

    wo.updatedBy = req.user._id;
    await wo.save();
    res.json(new ApiResponse(200, wo, 'Material status updated'));
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /work-orders/:id/refresh-stock  – Refresh stock from inventory
// ────────────────────────────────────────────────────────────────────────────
export const refreshMaterialStock = asyncHandler(async (req, res) => {
    const wo = await WorkOrder.findById(req.params.id);
    if (!wo) throw new ApiError(404, 'Work Order not found');

    const itemIds = wo.materialStatus.map(m => m.itemId);
    const items = await Item.find({ _id: { $in: itemIds } }).select('_id currentStock');
    const stockMap = items.reduce((acc, item) => {
        acc[item._id.toString()] = item.currentStock || 0;
        return acc;
    }, {});

    for (const mat of wo.materialStatus) {
        const availableLatest = stockMap[mat.itemId.toString()] || 0;
        mat.availableStock = availableLatest;
        mat.shortQty = Math.max(0, mat.requiredQty - availableLatest);
    }

    wo.updatedBy = req.user._id;
    await wo.save();
    res.json(new ApiResponse(200, wo, 'Material stock refreshed from inventory'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /work-orders/dashboard-stats  – Summary counts for dashboard tiles
// ────────────────────────────────────────────────────────────────────────────
export const getDashboardStats = asyncHandler(async (req, res) => {
    const statuses = [
        'Draft', 'Released', 'In Process',
        'WIP – Waiting Material', 'On Hold', 'Completed', 'Closed',
    ];

    const pipeline = [
        { $group: { _id: '$status', count: { $sum: 1 } } },
    ];

    const results = await WorkOrder.aggregate(pipeline);
    const stats = {};
    statuses.forEach(s => { stats[s] = 0; });
    results.forEach(r => { stats[r._id] = r.count; });

    // Today completed
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    stats['Completed Today'] = await WorkOrder.countDocuments({
        status: 'Completed',
        actualEnd: { $gte: todayStart },
    });

    // QC Pending (stage 7 or 9 Running or QC Hold)
    stats['QC Pending'] = await WorkOrder.countDocuments({
        'stages': {
            $elemMatch: {
                seq: { $in: [7, 9] },
                status: { $in: ['Not Started', 'Running'] },
            },
        },
        status: { $in: ['In Process', 'Released'] },
    });

    // Testing Pending (stage 8)
    stats['Testing Pending'] = await WorkOrder.countDocuments({
        'stages': {
            $elemMatch: {
                seq: 8,
                status: { $in: ['Not Started', 'Running'] },
            },
        },
        status: { $in: ['In Process', 'Released'] },
    });

    res.json(new ApiResponse(200, stats, 'Dashboard stats fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// DELETE /work-orders/:id  – Soft delete (Draft only)
// ────────────────────────────────────────────────────────────────────────────
export const deleteWorkOrder = asyncHandler(async (req, res) => {
    const wo = await WorkOrder.findById(req.params.id);
    if (!wo) throw new ApiError(404, 'Work Order not found');
    // if (wo.status !== 'Draft') throw new ApiError(400, 'Only Draft WOs can be deleted');

    await WorkOrder.findByIdAndDelete(req.params.id);
    res.json(new ApiResponse(200, null, 'Work Order deleted'));
});

// ── Helper: default checklist items per QC stage ────────────────────────────
const getDefaultChecklist = (stageName) => {
    if (stageName === '1st QC') {
        return [
            { item: 'Visual Inspection – solder joints', result: 'Pending', remarks: '' },
            { item: 'Component polarity check', result: 'Pending', remarks: '' },
            { item: 'Component placement verification', result: 'Pending', remarks: '' },
            { item: 'PCB cleanliness check', result: 'Pending', remarks: '' },
            { item: 'Connector seating check', result: 'Pending', remarks: '' },
        ];
    }
    if (stageName === 'Final QC') {
        return [
            { item: 'Final visual inspection', result: 'Pending', remarks: '' },
            { item: 'Label / marking verification', result: 'Pending', remarks: '' },
            { item: 'Packing check', result: 'Pending', remarks: '' },
            { item: 'Serial number / traceability', result: 'Pending', remarks: '' },
            { item: 'Dimensional check (if applicable)', result: 'Pending', remarks: '' },
        ];
    }
    return [];
};

// ── Temporary Cleanup Route ────────────────────────────────────────────────
export const bulkCleanup = asyncHandler(async (req, res) => {
    // Keep only the most recent one
    const wos = await WorkOrder.find({}).sort({ createdAt: -1 });
    if (wos.length <= 1) {
        return res.json(new ApiResponse(200, null, 'Already clean (1 or 0 WOs)'));
    }

    const toKeep = wos[0];
    const toDelete = wos.slice(1).map(w => w._id);

    const result = await WorkOrder.deleteMany({ _id: { $in: toDelete } });
    res.json(new ApiResponse(200, {
        kept: toKeep.woNumber,
        deletedCount: result.deletedCount
    }, 'Cleanup successful'));
});
