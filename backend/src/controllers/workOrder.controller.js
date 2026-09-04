import { WorkOrder, PRODUCTION_STAGES } from '../models/workOrder.model.js';
import { getCompanyFeatureSettings } from '../services/companyFeatureSettings.service.js';
import { resolveWorkOrderStagesForCompany } from '../services/productionTemplate.service.js';
import { BOM } from '../models/bom.model.js';
import { Item } from '../models/item.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getFYFromDate } from '../utils/fyUtils.js';
import { normalizeBomSectionsForRead } from '../utils/bomSection.utils.js';
import {
    createWorkOrderSchema,
    updateWorkOrderSchema,
    updateStageSchema,
    updateMaterialStatusSchema,
    addProductionLogSchema,
    createSectionWorkOrderSchema,
    updateSectionConfigSchema,
} from '../validations/workOrder.validation.js';
import { syncWorkOrderToInventory } from '../services/inventory.service.js';
import {
    SECTION_WO_KIND,
    EXCLUDE_SECTION_WO,
    isSectionWorkOrder,
    isSectionTrackingEnabled,
    buildSectionWoNumber,
    mainWoNumberSeriesRegex,
    computeCompleteSetsAvailable,
    assertFinalQtyAllowed,
    getInventorySyncQty,
    isFinalCompletionStage,
    filterBomComponentsBySection,
    cloneStagesForSectionWo,
    shouldSyncWorkOrderInventory,
    getAuthoritativeCompletedQty,
    getCurrentStageName,
    getUnresolvedRequiredMaterials,
    isDeferredMaterial,
    buildUnresolvedRequiredBlockMessage,
} from '../services/workOrderSection.service.js';
import mongoose from 'mongoose';

// ── Auto-generate WO Number ──────────────────────────────────────────────────
const generateWoNumber = async () => {
    const fy = getFYFromDate(new Date());
    const prefix = `WO-${fy}-`;

    // Main series only (WO-{fy}-{digits}). Section suffixes like -S1 must never consume the sequence.
    const lastWo = await WorkOrder.findOne({
        ...EXCLUDE_SECTION_WO,
        woNumber: { $regex: mainWoNumberSeriesRegex(prefix) }
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

    if (currentStatus === 'Draft' || currentStatus === 'On Hold' || currentStatus === 'Cancelled') return currentStatus;
    if (allDone) return 'Completed';
    if (anyRunning) return 'In Process';
    if (anyFailed) return 'In Process';
    if (stages.some(s => s.status !== 'Not Started')) return 'In Process';
    return currentStatus; // stay as Released / In Process
};

const loadCompleteSetsForParent = async (parentWo, session = null) => {
    if (!isSectionTrackingEnabled(parentWo)) {
        return { gated: false, completeSetsAvailable: parentWo.targetQty, sectionRows: [], parentTargetQty: parentWo.targetQty };
    }
    const q = WorkOrder.find({ parentWorkOrderId: parentWo._id, woKind: SECTION_WO_KIND });
    if (session) q.session(session);
    const children = await q.lean();
    const mandatory = (parentWo.sectionConfig?.sections || []).filter((s) => s.isMandatory);
    return computeCompleteSetsAvailable({
        parentTargetQty: parentWo.targetQty,
        mandatorySections: mandatory,
        sectionWorkOrders: children,
    });
};

const assertParentFinalCompletionGate = async (wo, seq, requestedQty, session = null) => {
    if (isSectionWorkOrder(wo) || !isSectionTrackingEnabled(wo)) return;
    if (!isFinalCompletionStage(wo, seq) && wo.status !== 'Completed') return;
    const sets = await loadCompleteSetsForParent(wo, session);
    if (!sets.gated) return;
    try {
        assertFinalQtyAllowed(requestedQty, sets.completeSetsAvailable);
    } catch (err) {
        throw new ApiError(400, err.message);
    }
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

    const featureSettings = req.companyId ? await getCompanyFeatureSettings(req.companyId) : null;
    const resolvedStages = await resolveWorkOrderStagesForCompany(req.companyId, featureSettings?.industry);
    const stageTemplate = resolvedStages.stages;
    const productionModule = resolvedStages.productionModule || 'electronics';

    const stages = stageTemplate.map(s => ({
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
            bomIsMandatory: c.isMandatory !== undefined ? c.isMandatory : true,
            isCritical: c.isCritical || false,
            alternateAvailable: !!c.alternateItem,
            consumptionStage: c.consumptionStage || '',
            procurementStatus: 'Not Ordered',
        };
    });

    const textilePayload = productionModule === 'textile' && value.textile
        ? {
            designNo: value.textile.designNo || '',
            colour: value.textile.colour || '',
            size: value.textile.size || '',
            requiredFabricMeter: Number(value.textile.requiredFabricMeter) || 0,
            fabricItemId: value.textile.fabricItemId || undefined,
            fabricItemName: value.textile.fabricItemName || '',
            lotNo: value.textile.lotNo || '',
            thanNo: value.textile.thanNo || '',
            rollNo: value.textile.rollNo || '',
            processRoute: value.textile.processRoute || '',
            assignedVendorWorker: value.textile.assignedVendorWorker || value.supervisor || '',
        }
        : undefined;

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
        productionModule,
        ...(textilePayload ? { textile: textilePayload } : {}),
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
    const { status, priority, search, page = 1, limit = 20, kind, parentWorkOrderId } = req.query;
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
    if (parentWorkOrderId) {
        query.parentWorkOrderId = parentWorkOrderId;
        query.woKind = SECTION_WO_KIND;
    } else if (kind === 'section') {
        query.woKind = SECTION_WO_KIND;
    } else if (kind !== 'all') {
        Object.assign(query, EXCLUDE_SECTION_WO);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await WorkOrder.countDocuments(query);
    const wos = await WorkOrder.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('finishedProductId', 'itemName itemCode')
        .populate('createdBy', 'name')
        .populate('parentWorkOrderId', 'woNumber');

    let sectionCountByParent = {};
    if (kind !== 'section' && !parentWorkOrderId && wos.length) {
        const ids = wos.map((w) => w._id);
        const counts = await WorkOrder.aggregate([
            { $match: { woKind: SECTION_WO_KIND, parentWorkOrderId: { $in: ids } } },
            { $group: { _id: '$parentWorkOrderId', count: { $sum: 1 } } },
        ]);
        sectionCountByParent = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
    }

    const workOrders = wos.map((w) => {
        const json = w.toObject();
        json.sectionWoCount = sectionCountByParent[String(w._id)] || 0;
        return json;
    });

    res.json(new ApiResponse(200, {
        workOrders,
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
    }, 'Work Orders fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /work-orders/:id  – Get single WO
// ────────────────────────────────────────────────────────────────────────────
export const getWorkOrderById = asyncHandler(async (req, res) => {
    let query = WorkOrder.findById(req.params.id)
        .populate('bomId', 'bomNumber version sectionCount sections')
        .populate('finishedProductId', 'itemName itemCode')
        .populate('createdBy', 'name')
        .populate('parentWorkOrderId', 'woNumber status targetQty finishedProductName');
    // Read-only print support. Skip when the path is not on this schema (Mongoose 8 strictPopulate).
    if (WorkOrder.schema.path('sourceSectionWorkOrderId')) {
        query = query.populate('sourceSectionWorkOrderId', 'woNumber bomSectionName bomSectionNo status materialStatus');
    }
    const wo = await query;

    if (!wo) throw new ApiError(404, 'Work Order not found');

    const json = wo.toObject();
    if (isSectionWorkOrder(wo)) {
        json.completedQty = getAuthoritativeCompletedQty(wo);
        json.currentStageName = getCurrentStageName(wo);
        json.phase1ProcessTrackingOnly = true;
    } else {
        const children = await WorkOrder.find({ parentWorkOrderId: wo._id, woKind: SECTION_WO_KIND })
            .select('woNumber bomSectionNo bomSectionName targetQty status stages supervisor createdAt isMandatorySection requiredQtyPerFinishedUnit materialStatus')
            .lean();
        json.sectionWorkOrders = children.map((c) => ({
            ...c,
            completedQty: getAuthoritativeCompletedQty(c),
            currentStageName: getCurrentStageName(c),
            materialStatus: undefined,
        }));
        json.sectionDeferredMaterials = children.flatMap((c) =>
            (c.materialStatus || [])
                .filter((m) => isDeferredMaterial(m))
                .map((m) => ({
                    itemId: m.itemId,
                    itemName: m.itemName,
                    requiredQty: m.requiredQty,
                    availableStock: m.availableStock,
                    shortQty: m.shortQty,
                    sectionWoNumber: c.woNumber,
                    bomSectionName: c.bomSectionName,
                }))
        );
        const mandatory = (wo.sectionConfig?.sections || []).filter((s) => s.isMandatory);
        json.completeSets = computeCompleteSetsAvailable({
            parentTargetQty: wo.targetQty,
            mandatorySections: mandatory,
            sectionWorkOrders: children,
        });
        json.bomSections = wo.bomId?.sections || [];
    }

    res.json(new ApiResponse(200, json, 'Work Order fetched'));
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
    // Phase 1 Section WOs are process-tracking only — do not block release on stock.
    if (!isSectionWorkOrder(wo)) {
        const mandatoryShortages = wo.materialStatus.filter(m => m.isMandatory && m.shortQty > 0);
        if (mandatoryShortages.length > 0) {
            const itemNames = mandatoryShortages.map(m => m.itemName).join(', ');
            throw new ApiError(400, `Cannot release WO due to mandatory material shortage: ${itemNames}. Please restock or untick them as mandatory to proceed.`);
        }
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
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { error, value } = updateStageSchema.validate(req.body);
        if (error) throw new ApiError(400, error.details[0].message);

        const wo = await WorkOrder.findById(req.params.id).session(session);
        if (!wo) throw new ApiError(404, 'Work Order not found');
        if (wo.status === 'Cancelled') {
            throw new ApiError(400, 'Cancelled Work Order cannot have stages updated');
        }
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

        // ── Shortage gate: prevent Completed on Final QC (seq 9) if BOM-required material is still unresolved ──
        // Uses original BOM requirement (bomIsMandatory), not the temporary WO Mandatory tick.
        // Section WOs skip this — they never post finished goods.
        if (seq === 9 && value.status === 'Completed' && !isSectionWorkOrder(wo)) {
            const pendingRequired = getUnresolvedRequiredMaterials(wo.materialStatus);
            if (pendingRequired.length > 0) {
                throw new ApiError(400, buildUnresolvedRequiredBlockMessage(pendingRequired));
            }
        }

        // Derive overall WO status
        if (wo.status !== 'On Hold' && wo.status !== 'Cancelled') {
            wo.status = deriveWoStatus(wo.stages, wo.status);
            if (wo.status === 'In Process' && !wo.actualStart) wo.actualStart = new Date();
            if (wo.status === 'Completed') wo.actualEnd = new Date();
        }

        if (isFinalCompletionStage(wo, seq) || wo.status === 'Completed') {
            await assertParentFinalCompletionGate(wo, seq, getInventorySyncQty(wo), session);
        }

        // ── INVENTORY SYNC ──
        if (shouldSyncWorkOrderInventory(wo)) {
            await syncWorkOrderToInventory(wo, session, req.user._id);
        }

        wo.updatedBy = req.user._id;
        await wo.save({ session });
        await session.commitTransaction();
        res.json(new ApiResponse(200, wo, `Stage "${stage.stageName}" updated`));
    } catch (e) {
        await session.abortTransaction();
        throw e;
    } finally {
        session.endSession();
    }
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

    // ── Shortage gate: prevent Completed on Final QC (seq 9) if BOM-required material is still unresolved ──
    if (stage.seq === 9 && stage.status === 'Completed' && !isSectionWorkOrder(wo)) {
        const pendingRequired = getUnresolvedRequiredMaterials(wo.materialStatus);
        if (pendingRequired.length > 0) {
            stage.status = 'QC Hold';
            wo.status = 'WIP – Waiting Material';
            wo.wip.isOnHold = true;
            wo.wip.holdReason = buildUnresolvedRequiredBlockMessage(pendingRequired);
            wo.wip.missingMandatoryItems = pendingRequired.map(m => m.itemName);
            return { blocked: true };
        }
    }

    // Derive overall WO status
    if (wo.status !== 'On Hold' && wo.status !== 'Cancelled') {
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
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { error, value } = addProductionLogSchema.validate(req.body);
        if (error) throw new ApiError(400, error.details[0].message);

        const wo = await WorkOrder.findById(req.params.id).session(session);
        if (!wo) throw new ApiError(404, 'Work Order not found');
        if (wo.status === 'Cancelled') {
            throw new ApiError(400, 'Cancelled Work Order cannot have production logged');
        }
        if (!['Released', 'In Process', 'WIP – Waiting Material'].includes(wo.status)) {
            throw new ApiError(400, `WO in status "${wo.status}" cannot have production logged`);
        }

        const seq = Number(req.params.seq);
        const stage = wo.stages.find(s => s.seq === seq);
        if (!stage) throw new ApiError(404, `Stage ${seq} not found`);

        const skipSectionStockGates = isSectionWorkOrder(wo);

        // ── 1. STAGE-SPECIFIC MATERIAL DEPENDENCY ────────────────────────────────
        if (!skipSectionStockGates && seq === 1) { // PCB Stage
            const pcbShortages = wo.materialStatus.filter(m => m.itemType === 'PCB' && m.shortQty > 0);
            if (pcbShortages.length > 0) {
                throw new ApiError(400, `PCB Stage blocked: Missing PCB items (${pcbShortages.map(m => m.itemName).join(', ')}).`);
            }
        }

        // Auto-populate missing components for Pick & Place and TH Mounting
        if (!skipSectionStockGates && (seq === 2 || seq === 3)) { // Pick & Place or TH Mounting
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

        if (isFinalCompletionStage(wo, seq)) {
            await assertParentFinalCompletionGate(wo, seq, expectedOutput, session);
        }

        // Add Log
        stage.productionLogs.push(value);

        // Recalculate Totals & Status
        const { blocked } = recalculateStageAndWo(wo, stage);

        if (wo.status === 'Completed') {
            await assertParentFinalCompletionGate(wo, seq, getInventorySyncQty(wo), session);
        }

        // ── 4. FG COMPLETION LOGIC ──
        if (shouldSyncWorkOrderInventory(wo)) {
            await syncWorkOrderToInventory(wo, session, req.user._id);
        }

        wo.updatedBy = req.user._id;
        await wo.save({ session });
        await session.commitTransaction();

        const responseMsg = blocked
            ? (wo.wip?.holdReason || 'Production logged, but Final QC blocked due to unresolved required material')
            : `Production logged successfully for Stage "${stage.stageName}"`;

        res.status(201).json(new ApiResponse(201, wo, responseMsg));
    } catch (e) {
        await session.abortTransaction();
        throw e;
    } finally {
        session.endSession();
    }
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
    if (['Closed', 'Cancelled', 'Completed'].includes(wo.status)) {
        throw new ApiError(400, `WO in status "${wo.status}" cannot have material status changed`);
    }

    for (const upd of value.materialUpdates) {
        const mat = wo.materialStatus.id(upd.materialId);
        if (!mat) continue;
        if (isSectionWorkOrder(wo)) {
            // Phase 1: no stock reserve/consume. WO-specific Mandatory and remarks only.
            if (upd.isMandatory !== undefined) mat.isMandatory = upd.isMandatory;
            if (upd.remarks !== undefined) mat.remarks = upd.remarks;
            continue;
        }
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
    const { from, to, financialYear } = req.query;
    
    // Status list for defaulting
    const statuses = [
        'Draft', 'Released', 'In Process',
        'WIP – Waiting Material', 'On Hold', 'Completed', 'Closed',
    ];

    // 1. Build Global Stats Match (only filtered by Financial Year)
    const globalMatch = { ...EXCLUDE_SECTION_WO };
    if (financialYear) globalMatch.financialYear = financialYear;

    const results = await WorkOrder.aggregate([
        { $match: globalMatch },
        { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const stats = {};
    statuses.forEach(s => { stats[s] = 0; });
    results.forEach(r => { if (r._id) stats[r._id] = r.count; });

    // 2. Completed range calculations
    let start = from ? new Date(from) : new Date();
    let end = to ? new Date(to) : new Date();
    
    // Set to absolute start/end of day
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const completedRangeQuery = {
        status: 'Completed',
        actualEnd: { $gte: start, $lte: end },
        ...EXCLUDE_SECTION_WO,
    };
    if (financialYear) completedRangeQuery.financialYear = financialYear;

    stats['Completed Today'] = await WorkOrder.countDocuments(completedRangeQuery);
    stats['Completed Total'] = stats['Completed'] || 0;

    // 3. QC & Testing Pending (Filtered by FY)
    const pendingMatch = { 
        status: { $in: ['In Process', 'Released'] },
        ...EXCLUDE_SECTION_WO,
        ...(financialYear ? { financialYear } : {})
    };

    stats['QC Pending'] = await WorkOrder.countDocuments({
        ...pendingMatch,
        'stages': { $elemMatch: { seq: { $in: [7, 9] }, status: { $in: ['Not Started', 'Running'] } } }
    });

    stats['Testing Pending'] = await WorkOrder.countDocuments({
        ...pendingMatch,
        'stages': { $elemMatch: { seq: 8, status: { $in: ['Not Started', 'Running'] } } }
    });

    console.log(`[DASHBOARD DEBUG] FY: ${financialYear} | Range: ${from} to ${to} | Matches: ${JSON.stringify(stats)}`);
    res.json(new ApiResponse(200, stats, 'Dashboard stats fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// GET /work-orders/:id/section-work-orders
// ────────────────────────────────────────────────────────────────────────────
export const getSectionWorkOrders = asyncHandler(async (req, res) => {
    const parent = await WorkOrder.findById(req.params.id);
    if (!parent) throw new ApiError(404, 'Work Order not found');
    if (isSectionWorkOrder(parent)) throw new ApiError(400, 'Section Work Orders do not have child Section WOs');

    const children = await WorkOrder.find({ parentWorkOrderId: parent._id, woKind: SECTION_WO_KIND })
        .sort({ bomSectionNo: 1, createdAt: 1 })
        .lean();
    const mandatory = (parent.sectionConfig?.sections || []).filter((s) => s.isMandatory);
    const completeSets = computeCompleteSetsAvailable({
        parentTargetQty: parent.targetQty,
        mandatorySections: mandatory,
        sectionWorkOrders: children,
    });

    res.json(new ApiResponse(200, {
        parentWorkOrderId: parent._id,
        parentWoNumber: parent.woNumber,
        sectionConfig: parent.sectionConfig || { enabled: false, sections: [] },
        sectionWorkOrders: children.map((c) => ({
            ...c,
            completedQty: getAuthoritativeCompletedQty(c),
            currentStageName: getCurrentStageName(c),
        })),
        completeSets,
    }, 'Section Work Orders fetched'));
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /work-orders/:id/section-config  – mark mandatory BOM sections (parent only)
// ────────────────────────────────────────────────────────────────────────────
export const updateSectionConfig = asyncHandler(async (req, res) => {
    const { error, value } = updateSectionConfigSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const parent = await WorkOrder.findById(req.params.id);
    if (!parent) throw new ApiError(404, 'Work Order not found');
    if (isSectionWorkOrder(parent)) throw new ApiError(400, 'Section config is only set on the parent Work Order');
    if (parent.productionModule === 'textile') {
        throw new ApiError(400, 'Section Work Orders are not available for textile job orders');
    }

    parent.sectionConfig = {
        enabled: value.enabled !== false,
        sections: value.sections.map((s) => ({
            bomSectionNo: Number(s.bomSectionNo),
            bomSectionName: String(s.bomSectionName || '').trim(),
            requiredQtyPerFinishedUnit: Number(s.requiredQtyPerFinishedUnit) > 0 ? Number(s.requiredQtyPerFinishedUnit) : 1,
            isMandatory: s.isMandatory !== false,
        })),
    };
    parent.updatedBy = req.user._id;
    await parent.save();

    const children = await WorkOrder.find({ parentWorkOrderId: parent._id, woKind: SECTION_WO_KIND }).lean();
    const mandatory = parent.sectionConfig.sections.filter((s) => s.isMandatory);
    const completeSets = computeCompleteSetsAvailable({
        parentTargetQty: parent.targetQty,
        mandatorySections: mandatory,
        sectionWorkOrders: children,
    });

    res.json(new ApiResponse(200, { workOrder: parent, completeSets }, 'Section configuration saved'));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /work-orders/:id/section-work-orders  – create linked section WO
// Phase 1: process tracking only. Does not reserve, issue, consume, or post FG.
// ────────────────────────────────────────────────────────────────────────────
export const createSectionWorkOrder = asyncHandler(async (req, res) => {
    const { error, value } = createSectionWorkOrderSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const parent = await WorkOrder.findById(req.params.id);
    if (!parent) throw new ApiError(404, 'Work Order not found');
    if (isSectionWorkOrder(parent)) {
        throw new ApiError(400, 'Cannot create a Section Work Order under another Section Work Order');
    }
    if (parent.productionModule === 'textile') {
        throw new ApiError(400, 'Section Work Orders are not available for textile job orders');
    }
    if (['Closed', 'Cancelled'].includes(parent.status)) {
        throw new ApiError(400, `Cannot create Section WO under a ${parent.status} parent`);
    }

    const bom = await BOM.findById(parent.bomId);
    if (!bom) throw new ApiError(404, 'BOM not found');
    const normalized = normalizeBomSectionsForRead(bom);
    const section = (normalized.sections || []).find((s) => Number(s.sectionNo) === Number(value.bomSectionNo));
    if (!section) throw new ApiError(400, `BOM section ${value.bomSectionNo} not found on this BOM`);

    const existingActive = await WorkOrder.findOne({
        parentWorkOrderId: parent._id,
        woKind: SECTION_WO_KIND,
        bomSectionNo: Number(value.bomSectionNo),
        status: { $ne: 'Cancelled' },
    });
    if (existingActive) {
        throw new ApiError(400, `An active Section Work Order already exists for ${section.sectionName} (${existingActive.woNumber}). Split/batch Section WOs are not supported in V1.`);
    }

    const cfgMatch = (parent.sectionConfig?.sections || []).find((s) => Number(s.bomSectionNo) === Number(value.bomSectionNo));
    const requiredQty = Number(value.requiredQtyPerFinishedUnit) > 0
        ? Number(value.requiredQtyPerFinishedUnit)
        : (Number(cfgMatch?.requiredQtyPerFinishedUnit) > 0 ? Number(cfgMatch.requiredQtyPerFinishedUnit) : 1);
    const maxTarget = parent.targetQty * requiredQty;
    const targetQty = value.targetQty != null ? Number(value.targetQty) : maxTarget;
    if (targetQty > maxTarget) {
        throw new ApiError(400, `Section target cannot exceed parent required quantity (${maxTarget}).`);
    }

    const woNumber = buildSectionWoNumber(parent.woNumber, value.bomSectionNo);
    const numberClash = await WorkOrder.findOne({ woNumber });
    if (numberClash) {
        throw new ApiError(400, `Work Order Number ${woNumber} already exists. Re-open the existing Section WO instead of creating a duplicate.`);
    }

    const sectionComponents = filterBomComponentsBySection(normalized.components, value.bomSectionNo);
    const itemIds = sectionComponents.map((c) => c.itemId).filter(Boolean);
    const items = await Item.find({ _id: { $in: itemIds } }).select('_id currentStock itemType');
    const itemMap = items.reduce((acc, item) => {
        acc[item._id.toString()] = {
            currentStock: item.currentStock || 0,
            itemType: item.itemType || 'OTHER',
        };
        return acc;
    }, {});

    const materialStatus = sectionComponents.map((c) => {
        const requiredQtyMat = (Number(c.quantity) || 0) * targetQty;
        const itemInfo = itemMap[c.itemId?.toString()] || { currentStock: 0, itemType: 'OTHER' };
        return {
            itemId: c.itemId,
            itemCode: c.itemCode || '',
            itemName: c.itemName || '',
            itemType: itemInfo.itemType,
            uom: c.uom || '',
            requiredQty: requiredQtyMat,
            availableStock: itemInfo.currentStock,
            reservedQty: 0,
            shortQty: Math.max(0, requiredQtyMat - itemInfo.currentStock),
            isMandatory: true,
            bomIsMandatory: true,
            isCritical: false,
            alternateAvailable: false,
            consumptionStage: '',
            procurementStatus: 'Not Ordered',
            remarks: '',
        };
    });

    const stages = cloneStagesForSectionWo(parent.stages, PRODUCTION_STAGES);

    if (!parent.sectionConfig) parent.sectionConfig = { enabled: false, sections: [] };
    parent.sectionConfig.enabled = true;
    const cfgList = Array.isArray(parent.sectionConfig.sections) ? [...parent.sectionConfig.sections] : [];
    if (!cfgList.some((s) => Number(s.bomSectionNo) === Number(value.bomSectionNo))) {
        cfgList.push({
            bomSectionNo: Number(value.bomSectionNo),
            bomSectionName: section.sectionName,
            requiredQtyPerFinishedUnit: requiredQty,
            isMandatory: value.isMandatory !== false,
        });
        parent.sectionConfig.sections = cfgList;
    }
    parent.updatedBy = req.user._id;
    await parent.save();

    const wo = await WorkOrder.create({
        woNumber,
        woKind: SECTION_WO_KIND,
        parentWorkOrderId: parent._id,
        bomId: parent.bomId,
        finishedProductId: parent.finishedProductId,
        finishedProductName: parent.finishedProductName,
        bomVersion: parent.bomVersion,
        bomSectionNo: Number(value.bomSectionNo),
        bomSectionName: section.sectionName,
        requiredQtyPerFinishedUnit: requiredQty,
        isMandatorySection: value.isMandatory !== false,
        targetQty,
        priority: parent.priority,
        plannedStart: value.plannedStart || undefined,
        supervisor: value.supervisor || parent.supervisor || '',
        remarks: value.remarks || '',
        productionModule: parent.productionModule || 'electronics',
        stages,
        materialStatus,
        financialYear: parent.financialYear,
        inventorySynced: false,
        createdBy: req.user._id,
    });

    res.status(201).json(new ApiResponse(201, wo, `Section Work Order ${wo.woNumber} created (process tracking only — no stock posting)`));
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /work-orders/:id/cancel  – cancel a Section WO only (does not cancel parent/siblings)
// ────────────────────────────────────────────────────────────────────────────
export const cancelSectionWorkOrder = asyncHandler(async (req, res) => {
    const wo = await WorkOrder.findById(req.params.id);
    if (!wo) throw new ApiError(404, 'Work Order not found');
    if (!isSectionWorkOrder(wo)) {
        throw new ApiError(400, 'Only Section Work Orders can be cancelled with this action. Parent Work Orders are unchanged.');
    }
    if (wo.status === 'Cancelled') {
        throw new ApiError(400, 'Section Work Order is already cancelled');
    }
    if (wo.inventorySynced) {
        throw new ApiError(400, 'Cannot cancel a Work Order that has posted inventory');
    }

    wo.status = 'Cancelled';
    wo.updatedBy = req.user._id;
    await wo.save();

    res.json(new ApiResponse(200, wo, 'Section Work Order cancelled. Parent and sibling Section WOs are unchanged.'));
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
