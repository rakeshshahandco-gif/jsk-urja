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
    addMaterialLaterSchema,
    addMaterialLaterBulkSchema,
    addMissingMaterialToProductSchema,
    createSupplementaryWorkOrderSchema,
    createSupplementaryWorkOrderBulkSchema,
    createSupplementaryFromMaterialIssueSchema,
    restoreSectionWorkOrderSchema,
} from '../validations/workOrder.validation.js';
import { syncWorkOrderToInventory } from '../services/inventory.service.js';
import {
    applyStageWiseMaterialConsumption,
    assertStageReduceAllowed,
    listStageMaterialConsumption,
} from '../services/workOrderStageConsumption.service.js';
import {
    issueLateMaterialBatch,
    postedIssueQtyByMaterial,
    getPostedIssueQtyForMaterial,
    getRemainingToIssueQty,
    existingSupForMaterial,
    resolveSectionMaterialLine,
    loadLateMaterialIssueBatchesForWorkOrder,
    findIssueOnWorkOrder,
    serializeMaterialIssueBatch,
    canAppendLateMaterialToSupplementary,
    groupSelectedMaterialsBySupplementary,
    resolveUnassignedSupplementaryPlan,
} from '../services/workOrderMaterialIssue.service.js';
import { checkUserPermission } from '../utils/permissionUtils.js';
import {
    SECTION_WO_KIND,
    SUPPLEMENTARY_WO_KIND,
    EXCLUDE_SECTION_WO,
    isSectionWorkOrder,
    isSupplementaryWorkOrder,
    isProcessOnlyWorkOrder,
    isSectionTrackingEnabled,
    buildSectionWoNumber,
    buildSupplementaryWoNumber,
    nextSupplementaryIndex,
    cloneStagesForSupplementary,
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
    attachSectionToMaterialLines,
    filterSectionWorkOrderMaterials,
    collectPendingFgMaterials,
    buildMandatoryChangeEntry,
    lateMaterialItemLabel,
    getSupplementaryAllocatedQty,
    getSupplementaryCompletedQty,
    getRemainingPendingQty,
    getRemainingToResolveQty,
    shouldMarkFullyResolved,
    getMaxMaterialCompleteFgQty,
    buildMaterialCompleteFgBlockMessage,
    hasUnresolvedLateMaterialToResolve,
    collectLateMaterialLines,
    buildLateMaterialFullResolveBlockMessage,
    buildMaterialEventEntry,
    enrichMaterialLateFields,
    DEFAULT_SUPPLEMENTARY_REASON,
    canHardDeleteSectionWorkOrder,
    buildDeletedSectionExistsMessage,
    classifyParentDeleteSectionChildren,
    buildParentDeleteBlockedMessage,
} from '../services/workOrderSection.service.js';
import {
    getSequenceBlocker,
    buildCannotStartMessage,
    getApplicablePreviousStage,
    getApplicableNextStage,
    getQtyStarted,
    getQtyCompleted,
    getStageRequiredQty,
    buildBackwardEditMessage,
} from '../services/workOrderStageSequence.service.js';
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
    if (isProcessOnlyWorkOrder(wo) || !isSectionTrackingEnabled(wo)) return;
    if (!isFinalCompletionStage(wo, seq) && wo.status !== 'Completed') return;
    const sets = await loadCompleteSetsForParent(wo, session);
    if (!sets.gated) return;
    try {
        assertFinalQtyAllowed(requestedQty, sets.completeSetsAvailable);
    } catch (err) {
        throw new ApiError(400, err.message);
    }
};

const assertParentFgMaterialComplete = async (wo, session = null, requestedQty = null) => {
    if (isProcessOnlyWorkOrder(wo)) return;
    const q = WorkOrder.find({ parentWorkOrderId: wo._id, woKind: SECTION_WO_KIND })
        .select('materialStatus woNumber bomSectionName');
    if (session) q.session(session);
    const children = await q.lean();
    const req = requestedQty != null ? Number(requestedQty) : getInventorySyncQty(wo);
    if (hasUnresolvedLateMaterialToResolve(wo.materialStatus, children)) {
        throw new ApiError(400, buildLateMaterialFullResolveBlockMessage(
            collectLateMaterialLines(wo.materialStatus, children)
        ));
    }
    const maxFg = getMaxMaterialCompleteFgQty({
        parentTargetQty: wo.targetQty,
        parentMaterials: wo.materialStatus,
        sectionWorkOrders: children,
    });
    if (req > maxFg) {
        const pending = collectPendingFgMaterials(wo.materialStatus, children);
        if (maxFg <= 0 && pending.length > 0) {
            throw new ApiError(400, buildUnresolvedRequiredBlockMessage(pending));
        }
        throw new ApiError(400, buildMaterialCompleteFgBlockMessage(req, maxFg));
    }
};

const assertLateMaterialWritePermission = (req) => {
    const user = req.user;
    if (checkUserPermission(user, 'production.work_orders.edit')) return;
    if (checkUserPermission(user, 'production.work_orders.add')) return;
    if (checkUserPermission(user, 'inventory.stock_ledger.edit')) return;
    const role = String(user?.roleName || user?.role?.name || '').toLowerCase();
    if (role === 'admin' || role === 'superadmin') return;
    throw new ApiError(403, 'Not authorized to issue late material or create a Supplementary Work Order');
};

const mapSupplementaryListRow = (c) => ({
    ...c,
    completedQty: getAuthoritativeCompletedQty(c),
    currentStageName: getCurrentStageName(c),
});

function findMaterialIssueNoForSupplementary(section, supId) {
    for (const batch of section?.materialIssueHistory || []) {
        if (String(batch.supplementaryWorkOrderId || '') === String(supId)) return batch.issueNo || '';
        if ((batch.destinations || []).some((d) => String(d.workOrderId || d._id) === String(supId))) {
            return batch.issueNo || '';
        }
        if ((batch.lines || []).some((l) => String(l.supplementaryWorkOrderId || '') === String(supId))) {
            return batch.issueNo || '';
        }
    }
    return '';
}

const applySupplementaryCompletionToSource = async (supWo, userId, session = null) => {
    if (!isSupplementaryWorkOrder(supWo) || supWo.status !== 'Completed' || supWo.supplementaryPostedToParent) {
        return;
    }
    if (!supWo.sourceSectionWorkOrderId) {
        supWo.supplementaryPostedToParent = true;
        return;
    }
    const q = WorkOrder.findById(supWo.sourceSectionWorkOrderId);
    if (session) q.session(session);
    const source = await q;
    if (!source) {
        supWo.supplementaryPostedToParent = true;
        return;
    }
    if (!Array.isArray(source.materialEventHistory)) source.materialEventHistory = [];
    for (const sm of supWo.supplementaryMaterials || []) {
        const mat = source.materialStatus.id(sm.materialId)
            || source.materialStatus.find((m) => String(m.itemId) === String(sm.itemId));
        if (!mat) continue;
        const qty = Math.max(0, Number(sm.qty) || 0);
        const req = Math.max(0, Number(mat.requiredQty) || 0);
        const nextCompleted = Math.min(
            req || (getSupplementaryAllocatedQty(mat) + qty),
            getSupplementaryCompletedQty(mat) + qty
        );
        mat.supplementaryCompletedQty = nextCompleted;
        if (shouldMarkFullyResolved(mat)) mat.isMandatory = true;
        source.materialEventHistory.push(buildMaterialEventEntry({
            eventType: 'supplementary_completed',
            material: mat,
            qty,
            remainingPendingQty: getRemainingPendingQty(mat),
            remainingToAllocateQty: getRemainingPendingQty(mat),
            remainingToResolveQty: getRemainingToResolveQty(mat),
            userId,
            remarks: `Supplementary ${supWo.woNumber} completed`,
            supplementaryWorkOrderId: supWo._id,
            supplementaryWoNumber: supWo.woNumber,
        }));
    }
    source.updatedBy = userId;
    await source.save(session ? { session } : undefined);
    supWo.supplementaryPostedToParent = true;
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

    // Build material status from BOM components (WO snapshot — does not write BOM Master)
    const normalizedBom = normalizeBomSectionsForRead(bom);
    const materialStatus = (normalizedBom.components || []).map(c => {
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
            sectionNo: Number(c.sectionNo) >= 1 ? Number(c.sectionNo) : 1,
            sectionName: c.sectionName || '',
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
    const wo = await WorkOrder.findById(req.params.id)
        .populate('bomId', 'bomNumber version sectionCount sections components')
        .populate('finishedProductId', 'itemName itemCode')
        .populate('createdBy', 'name')
        .populate('parentWorkOrderId', 'woNumber status targetQty finishedProductName')
        .populate('sourceSectionWorkOrderId', 'woNumber bomSectionName bomSectionNo status materialStatus')
        .populate('mandatoryChangeHistory.changedBy', 'name')
        .populate('materialEventHistory.createdBy', 'name')
        .populate('materialIssueHistory.createdBy', 'name');

    if (!wo) throw new ApiError(404, 'Work Order not found');

    const json = wo.toObject();
    const normalizedBom = wo.bomId ? normalizeBomSectionsForRead(wo.bomId) : { components: [], sections: [] };
    if (isSupplementaryWorkOrder(wo)) {
        json.completedQty = getAuthoritativeCompletedQty(wo);
        json.currentStageName = '';
        json.phase1ProcessTrackingOnly = true;
        json.bomSections = normalizedBom.sections || [];
        json.materialStatus = enrichMaterialLateFields(json.materialStatus, []);
        json.displayStatus = ['Completed', 'Closed', 'Cancelled'].includes(wo.status) ? wo.status : 'Pending';
        if (!json.materialIssueNo && wo.sourceSectionWorkOrderId) {
            const sectionId = wo.sourceSectionWorkOrderId._id || wo.sourceSectionWorkOrderId;
            const section = await WorkOrder.findById(sectionId).select('materialIssueHistory').lean();
            json.materialIssueNo = findMaterialIssueNoForSupplementary(section, wo._id);
        }
    } else if (isSectionWorkOrder(wo)) {
        const sups = await WorkOrder.find({
            sourceSectionWorkOrderId: wo._id,
            woKind: SUPPLEMENTARY_WO_KIND,
        }).sort({ createdAt: 1 }).lean();
        json.supplementaryWorkOrders = sups.map((c) => ({
            ...mapSupplementaryListRow(c),
            canAcceptLateMaterialAppend: canAppendLateMaterialToSupplementary(c, { sectionId: wo._id }),
            displayStatus: ['Completed', 'Closed', 'Cancelled'].includes(c.status) ? c.status : 'Pending',
            materialIssueNo: c.materialIssueNo || findMaterialIssueNoForSupplementary(wo, c._id),
        }));
        json.materialStatus = enrichMaterialLateFields(
            filterSectionWorkOrderMaterials(
                json.materialStatus,
                wo.bomSectionNo,
                normalizedBom.components
            ),
            sups
        );
        json.completedQty = getAuthoritativeCompletedQty(wo);
        json.currentStageName = getCurrentStageName(wo);
        json.phase1ProcessTrackingOnly = true;
        json.bomSections = normalizedBom.sections || [];
    } else {
        json.materialStatus = attachSectionToMaterialLines(json.materialStatus, normalizedBom.components);
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
        json.bomSections = normalizedBom.sections || wo.bomId?.sections || [];
    }

    json.lateMaterialIssueBatches = (await loadLateMaterialIssueBatchesForWorkOrder(wo)).map((b) => {
        const row = serializeMaterialIssueBatch(b);
        return {
            ...row,
            supplementaryWoNumber: row.supplementaryWoNumber || '',
        };
    });
    const postedMap = postedIssueQtyByMaterial(json.lateMaterialIssueBatches);
    const supsForIssue = json.supplementaryWorkOrders || [];
    json.materialStatus = (json.materialStatus || []).map((m) => {
        const postedIssueQty = getPostedIssueQtyForMaterial(m, postedMap);
        const link = existingSupForMaterial(supsForIssue, m);
        return {
            ...m,
            postedIssueQty,
            remainingToIssueQty: getRemainingToIssueQty(m, postedIssueQty),
            existingSupplementaryWoNumber: link?.woNumber || '',
            existingSupplementaryWorkOrderId: link?._id || null,
        };
    });

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
        if (stage.notApplicable || stage.isApplicable === false) {
            throw new ApiError(400, 'Cannot update a stage marked Not Applicable — completed in original WO');
        }

        const prevCompleted = getQtyCompleted(stage);

        assertStageSequence(wo, seq, value.inputQty);
        assertQuantityPipeline(wo, stage, {
            inputQty: value.inputQty,
            outputQty: value.outputQty,
            status: value.status,
        });
        assertStageOutputWithinLimit(wo, stage, value.outputQty);

        // Assign values
        Object.assign(stage, value);

        // Auto-calculate aggregated quantities from productionLogs if provided
        if (value.productionLogs !== undefined) {
            stage.inputQty = value.productionLogs.reduce((sum, log) => sum + (log.inputQty || 0), 0);
            stage.outputQty = value.productionLogs.reduce((sum, log) => sum + (log.outputQty || 0), 0);
            stage.reworkQty = value.productionLogs.reduce((sum, log) => sum + (log.reworkQty || 0), 0);
            stage.rejectionQty = value.productionLogs.reduce((sum, log) => sum + (log.rejectionQty || 0), 0);

            assertQuantityPipeline(wo, stage, {
                inputQty: stage.inputQty,
                outputQty: stage.outputQty,
                status: stage.status,
            });
            assertStageOutputWithinLimit(wo, stage, stage.outputQty);
        }

        // ── Shortage gate: prevent Completed on Final QC (seq 9) if BOM-required material is still unresolved ──
        // Uses original BOM requirement (bomIsMandatory), not the temporary WO Mandatory tick.
        // Section WOs skip this — they never post finished goods.
        if (seq === 9 && value.status === 'Completed' && !isProcessOnlyWorkOrder(wo)) {
            await assertParentFgMaterialComplete(wo, session, getInventorySyncQty({ ...wo.toObject(), stages: wo.stages }));
        }

        // Derive overall WO status
        if (wo.status !== 'On Hold' && wo.status !== 'Cancelled') {
            wo.status = deriveWoStatus(wo.stages, wo.status);
            if (wo.status === 'In Process' && !wo.actualStart) wo.actualStart = new Date();
            if (wo.status === 'Completed') wo.actualEnd = new Date();
        }

        if (isFinalCompletionStage(wo, seq) || wo.status === 'Completed') {
            await assertParentFinalCompletionGate(wo, seq, getInventorySyncQty(wo), session);
            if (wo.status === 'Completed') {
                await assertParentFgMaterialComplete(wo, session, getInventorySyncQty(wo));
            }
        }

        await applySupplementaryCompletionToSource(wo, req.user._id, session);

        await applyStageWiseMaterialConsumption({
            wo,
            stage,
            completedQty: getQtyCompleted(stage),
            prevCompletedQty: prevCompleted,
            userId: req.user._id,
            session,
        });

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
    const prev = getApplicablePreviousStage(wo.stages, currentStage.seq);
    if (!prev) return wo.targetQty;
    return getQtyCompleted(prev);
};

const assertStageSequence = (wo, seq, proposedStarted) => {
    const current = wo.stages.find((s) => s.seq === seq);
    const blocker = getSequenceBlocker(wo.stages, seq, {
        proposedStarted: proposedStarted != null ? Number(proposedStarted) : getQtyStarted(current),
    });
    if (!blocker) return;
    throw new ApiError(400, buildCannotStartMessage(current, blocker));
};

const assertQuantityPipeline = (wo, stage, nextValues = {}) => {
    const started = nextValues.inputQty != null ? Number(nextValues.inputQty) : getQtyStarted(stage);
    const completed = nextValues.outputQty != null ? Number(nextValues.outputQty) : getQtyCompleted(stage);
    if (!Number.isFinite(started) || !Number.isFinite(completed) || started < 0 || completed < 0) {
        throw new ApiError(400, 'Quantities must be valid numbers greater than or equal to 0');
    }
    if (completed > started) {
        throw new ApiError(400, `Qty Completed (${completed}) cannot exceed Qty Started (${started}) on ${stage.stageName}.`);
    }

    const prev = getApplicablePreviousStage(wo.stages, stage.seq);
    const startedCap = prev ? getQtyCompleted(prev) : Number(wo.targetQty) || 0;
    if (started > startedCap) {
        if (prev) {
            throw new ApiError(400, `Cannot start ${started} pcs in ${stage.stageName}. Only ${startedCap} pcs have been completed in ${prev.stageName}.`);
        }
        throw new ApiError(400, `Cannot start ${started} pcs in ${stage.stageName}. Target Qty is ${startedCap}.`);
    }

    const next = getApplicableNextStage(wo.stages, stage.seq);
    if (next && completed < getQtyStarted(next)) {
        throw new ApiError(400, buildBackwardEditMessage(stage, next, completed));
    }

    if (nextValues.status === 'Completed' && completed < getStageRequiredQty(wo, stage)) {
        throw new ApiError(400, `Cannot mark ${stage.stageName} Completed until ${getStageRequiredQty(wo, stage)} pcs are completed (currently ${completed}).`);
    }
};

const assertStageOutputWithinLimit = (wo, stage, outputQty) => {
    if (outputQty === undefined || outputQty === null) return;
    const maxAllowed = getMaxAllowedOutput(wo, stage);
    if (outputQty > maxAllowed) {
        if (stage.seq === 1) {
            throw new ApiError(400, `Cannot exceed Target Qty (${wo.targetQty}). Total is ${outputQty}.`);
        }
        throw new ApiError(400, `Cannot exceed Previous Stage Output (${maxAllowed}). Total is ${outputQty}.`);
    }
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

    // Auto Status Logic — Completed only at full applicable target, not at partial previous output
    const required = getStageRequiredQty(wo, stage);
    if (required > 0 && stage.outputQty >= required) {
        stage.status = 'Completed';
    } else if (stage.outputQty > 0 || stage.inputQty > 0) {
        stage.status = 'Running';
    } else {
        stage.status = 'Not Started';
    }

    // ── Shortage gate: prevent Completed on Final QC (seq 9) if BOM-required material is still unresolved ──
    if (stage.seq === 9 && stage.status === 'Completed' && !isProcessOnlyWorkOrder(wo)) {
        if (hasUnresolvedLateMaterialToResolve(wo.materialStatus, [])) {
            const lateLines = collectLateMaterialLines(wo.materialStatus, []);
            stage.status = 'QC Hold';
            wo.status = 'WIP – Waiting Material';
            wo.wip.isOnHold = true;
            wo.wip.holdReason = buildLateMaterialFullResolveBlockMessage(lateLines);
            wo.wip.missingMandatoryItems = lateLines.map((m) => m.itemName);
            return { blocked: true };
        }
        const maxFg = getMaxMaterialCompleteFgQty({
            parentTargetQty: wo.targetQty,
            parentMaterials: wo.materialStatus,
            sectionWorkOrders: [],
        });
        const requested = getInventorySyncQty(wo);
        if (requested > maxFg) {
            const pendingRequired = getUnresolvedRequiredMaterials(wo.materialStatus);
            stage.status = 'QC Hold';
            wo.status = 'WIP – Waiting Material';
            wo.wip.isOnHold = true;
            wo.wip.holdReason = maxFg <= 0 && pendingRequired.length
                ? buildUnresolvedRequiredBlockMessage(pendingRequired)
                : buildMaterialCompleteFgBlockMessage(requested, maxFg);
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
        if (stage.notApplicable || stage.isApplicable === false) {
            throw new ApiError(400, 'Cannot log production on a stage marked Not Applicable — completed in original WO');
        }

        const skipSectionStockGates = isProcessOnlyWorkOrder(wo);

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
        const prevCompleted = getQtyCompleted(stage);
        const expectedStarted = getQtyStarted(stage) + (Number(value.inputQty) || 0);
        const expectedOutput = getQtyCompleted(stage) + (Number(value.outputQty) || 0);
        assertStageSequence(wo, seq, expectedStarted);
        assertQuantityPipeline(wo, stage, {
            inputQty: expectedStarted,
            outputQty: expectedOutput,
        });
        const maxAllowed = getMaxAllowedOutput(wo, stage);
        if (expectedOutput > maxAllowed) {
            if (stage.seq === 1) {
                throw new ApiError(400, `Cannot exceed Target Qty (${wo.targetQty}). Pending: ${wo.targetQty - stage.outputQty}.`);
            } else {
                const prevStage = getApplicablePreviousStage(wo.stages, seq);
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
            await assertParentFgMaterialComplete(wo, session, getInventorySyncQty(wo));
        }

        await applySupplementaryCompletionToSource(wo, req.user._id, session);

        await applyStageWiseMaterialConsumption({
            wo,
            stage,
            completedQty: getQtyCompleted(stage),
            prevCompletedQty: prevCompleted,
            userId: req.user._id,
            session,
        });

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

    const log = stage.productionLogs[logIndex];
    const nextCompleted = getQtyCompleted(stage) - (Number(log.outputQty) || 0);
    assertQuantityPipeline(wo, stage, {
        inputQty: getQtyStarted(stage) - (Number(log.inputQty) || 0),
        outputQty: nextCompleted,
    });
    await assertStageReduceAllowed(wo, stage, nextCompleted);

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

    if (!Array.isArray(wo.mandatoryChangeHistory)) wo.mandatoryChangeHistory = [];
    if (!Array.isArray(wo.materialEventHistory)) wo.materialEventHistory = [];

    for (const upd of value.materialUpdates) {
        const mat = wo.materialStatus.id(upd.materialId);
        if (!mat) continue;
        if (upd.isMandatory !== undefined && upd.isMandatory !== mat.isMandatory) {
            wo.mandatoryChangeHistory.push(buildMandatoryChangeEntry({
                material: mat,
                previousMandatory: mat.isMandatory,
                newMandatory: upd.isMandatory,
                userId: req.user?._id,
                remarks: upd.remarks !== undefined ? upd.remarks : mat.remarks,
            }));
            wo.materialEventHistory.push(buildMaterialEventEntry({
                eventType: upd.isMandatory ? 'restored' : 'deferred',
                material: mat,
                qty: Number(mat.requiredQty) || 0,
                remainingPendingQty: upd.isMandatory ? getRemainingPendingQty({ ...mat.toObject?.() || mat, isMandatory: true }) : (Number(mat.requiredQty) || 0),
                remainingToAllocateQty: upd.isMandatory ? getRemainingPendingQty({ ...mat.toObject?.() || mat, isMandatory: true }) : (Number(mat.requiredQty) || 0),
                remainingToResolveQty: getRemainingToResolveQty(mat),
                userId: req.user?._id,
                remarks: upd.remarks !== undefined ? upd.remarks : mat.remarks,
            }));
        }
        if (isSectionWorkOrder(wo)) {
            // Phase 1: no stock reserve/consume. WO-specific Mandatory and remarks only.
            // Never clear bomIsMandatory — original BOM requirement stays on this WO snapshot.
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
        const supplementaryCount = await WorkOrder.countDocuments({
            sourceSectionWorkOrderId: numberClash._id,
            woKind: SUPPLEMENTARY_WO_KIND,
        });
        const sameSection = isSectionWorkOrder(numberClash)
            && Number(numberClash.bomSectionNo) === Number(value.bomSectionNo);
        if (sameSection && canHardDeleteSectionWorkOrder(numberClash, { supplementaryCount })) {
            await WorkOrder.findByIdAndDelete(numberClash._id);
        } else if (sameSection) {
            const err = new ApiError(409, buildDeletedSectionExistsMessage(section.sectionName));
            err.code = 'SECTION_WO_EXISTS_RESTORABLE';
            err.data = {
                existingId: numberClash._id,
                woNumber: numberClash.woNumber,
                status: numberClash.status,
                bomSectionNo: numberClash.bomSectionNo,
                bomSectionName: numberClash.bomSectionName || section.sectionName,
                canRestore: true,
                parentMissing: !numberClash.parentWorkOrderId
                    || String(numberClash.parentWorkOrderId) !== String(parent._id),
            };
            throw err;
        } else {
            throw new ApiError(400, `Work Order Number ${woNumber} already exists. Re-open the existing Section WO instead of creating a duplicate.`);
        }
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
            sectionNo: Number(c.sectionNo) >= 1 ? Number(c.sectionNo) : Number(value.bomSectionNo),
            sectionName: c.sectionName || section.sectionName || '',
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

const ensureParentSectionConfig = (parent, section, requiredQty, isMandatory, userId) => {
    if (!parent.sectionConfig) parent.sectionConfig = { enabled: false, sections: [] };
    parent.sectionConfig.enabled = true;
    const cfgList = Array.isArray(parent.sectionConfig.sections) ? [...parent.sectionConfig.sections] : [];
    if (!cfgList.some((s) => Number(s.bomSectionNo) === Number(section.sectionNo || section.bomSectionNo))) {
        cfgList.push({
            bomSectionNo: Number(section.sectionNo || section.bomSectionNo),
            bomSectionName: section.sectionName || section.bomSectionName || '',
            requiredQtyPerFinishedUnit: requiredQty,
            isMandatory: isMandatory !== false,
        });
        parent.sectionConfig.sections = cfgList;
    }
    parent.updatedBy = userId;
};

// ────────────────────────────────────────────────────────────────────────────
// PATCH /work-orders/:id/section-work-orders/restore
// Re-link / reopen the original Section WO. Never creates S{n+1}.
// ────────────────────────────────────────────────────────────────────────────
export const restoreSectionWorkOrder = asyncHandler(async (req, res) => {
    const { error, value } = restoreSectionWorkOrderSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const parent = await WorkOrder.findById(req.params.id);
    if (!parent) throw new ApiError(404, 'Work Order not found');
    if (isSectionWorkOrder(parent) || isSupplementaryWorkOrder(parent)) {
        throw new ApiError(400, 'Restore must be called from the parent Work Order');
    }
    if (['Closed', 'Cancelled'].includes(parent.status)) {
        throw new ApiError(400, `Cannot restore a Section WO under a ${parent.status} parent`);
    }

    const sectionWo = await WorkOrder.findById(value.sectionWorkOrderId);
    if (!sectionWo) throw new ApiError(404, 'Section Work Order not found');
    if (!isSectionWorkOrder(sectionWo)) {
        throw new ApiError(400, 'Only a Section Work Order can be restored');
    }
    if (value.bomSectionNo != null && Number(sectionWo.bomSectionNo) !== Number(value.bomSectionNo)) {
        throw new ApiError(400, 'Section Work Order does not match the requested BOM section');
    }
    if (sectionWo.inventorySynced) {
        throw new ApiError(400, 'Cannot restore a Work Order that has posted inventory');
    }

    const expectedNumber = buildSectionWoNumber(parent.woNumber, sectionWo.bomSectionNo);
    if (sectionWo.woNumber !== expectedNumber) {
        throw new ApiError(400, `Section Work Order number ${sectionWo.woNumber} does not belong to ${expectedNumber}`);
    }

    const existingActive = await WorkOrder.findOne({
        parentWorkOrderId: parent._id,
        woKind: SECTION_WO_KIND,
        bomSectionNo: Number(sectionWo.bomSectionNo),
        status: { $ne: 'Cancelled' },
        _id: { $ne: sectionWo._id },
    });
    if (existingActive) {
        throw new ApiError(400, `An active Section Work Order already exists for ${sectionWo.bomSectionName} (${existingActive.woNumber}).`);
    }

    sectionWo.parentWorkOrderId = parent._id;
    if (sectionWo.status === 'Cancelled') {
        sectionWo.status = deriveWoStatus(sectionWo.stages || [], 'Released');
    }
    sectionWo.updatedBy = req.user._id;
    await sectionWo.save();

    const requiredQty = Number(sectionWo.requiredQtyPerFinishedUnit) > 0 ? Number(sectionWo.requiredQtyPerFinishedUnit) : 1;
    ensureParentSectionConfig(parent, sectionWo, requiredQty, sectionWo.isMandatorySection !== false, req.user._id);
    await parent.save();

    res.json(new ApiResponse(200, sectionWo, `Section Work Order ${sectionWo.woNumber} restored. History is unchanged.`));
});

// ────────────────────────────────────────────────────────────────────────────
// POST /work-orders/:id/materials/:materialId/add-later
// Issues late material from inventory (StockLedger WO_CONSUMPTION vs parent/reference).
// ────────────────────────────────────────────────────────────────────────────
export const addMaterialLater = asyncHandler(async (req, res) => {
    assertLateMaterialWritePermission(req);
    const { error, value } = addMaterialLaterSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const wo = await WorkOrder.findById(req.params.id).session(session);
        assertWoAcceptsLateMaterial(wo);
        const result = await issueLateMaterialBatch({
            wo,
            items: [{ materialId: req.params.materialId, qty: value.qty, remarks: value.remarks || '' }],
            remarks: value.remarks || '',
            idempotencyKey: value.idempotencyKey || '',
            userId: req.user._id,
            companyId: req.companyId || null,
            session,
        });
        if (!result.reused) {
            wo.updatedBy = req.user._id;
            await wo.save({ session });
        }
        await session.commitTransaction();
        res.json(new ApiResponse(200, { workOrder: result.wo, batch: serializeMaterialIssueBatch(result.batch), reused: !!result.reused }, result.reused
            ? `Material Issue ${result.batch.issueNo} already posted. Stock was not deducted again.`
            : 'Material issued successfully.'));
    } catch (e) {
        await session.abortTransaction();
        throw e;
    } finally {
        session.endSession();
    }
});

const assertWoAcceptsLateMaterial = (wo) => {
    if (!wo) throw new ApiError(404, 'Work Order not found');
    if (['Closed', 'Cancelled', 'Completed'].includes(wo.status)) {
        throw new ApiError(400, `WO in status "${wo.status}" cannot have late material issued`);
    }
};

// ────────────────────────────────────────────────────────────────────────────
// POST /work-orders/:id/materials/add-later-bulk
// All-or-nothing late material issue from inventory + Material Issue batch.
// ────────────────────────────────────────────────────────────────────────────
export const addMaterialLaterBulk = asyncHandler(async (req, res) => {
    assertLateMaterialWritePermission(req);
    const { error, value } = addMaterialLaterBulkSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const wo = await WorkOrder.findById(req.params.id).session(session);
        assertWoAcceptsLateMaterial(wo);
        const result = await issueLateMaterialBatch({
            wo,
            items: value.items,
            remarks: value.remarks || '',
            idempotencyKey: value.idempotencyKey || '',
            userId: req.user._id,
            companyId: req.companyId || null,
            session,
        });
        if (!result.reused) {
            wo.updatedBy = req.user._id;
            await wo.save({ session });
        }
        await session.commitTransaction();
        res.json(new ApiResponse(200, { workOrder: result.wo, batch: serializeMaterialIssueBatch(result.batch), reused: !!result.reused }, result.reused
            ? `Material Issue ${result.batch.issueNo} already posted. Stock was not deducted again.`
            : 'Material issued successfully.'));
    } catch (e) {
        await session.abortTransaction();
        throw e;
    } finally {
        session.endSession();
    }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /work-orders/:id/supplementary-work-orders
// Phase 1: process / progress + late-material traceability. No stock or FG posting.
// ────────────────────────────────────────────────────────────────────────────
export const createSupplementaryWorkOrder = asyncHandler(async (req, res) => {
    assertLateMaterialWritePermission(req);
    const { error, value } = createSupplementaryWorkOrderSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const section = await WorkOrder.findById(req.params.id);
    if (!section) throw new ApiError(404, 'Work Order not found');
    if (!isSectionWorkOrder(section)) {
        throw new ApiError(400, 'Supplementary Work Orders can only be created from a Section Work Order');
    }
    if (['Closed', 'Cancelled'].includes(section.status)) {
        throw new ApiError(400, `Cannot create a Supplementary WO under a ${section.status} Section WO`);
    }

    const mat = section.materialStatus.id(value.materialId);
    if (!mat) throw new ApiError(404, 'Component not found on this Section Work Order');

    const qty = Number(value.qty);
    const remaining = getRemainingPendingQty(mat);
    if (!(qty > 0)) throw new ApiError(400, 'Supplementary Qty must be greater than 0');
    if (qty > remaining) {
        throw new ApiError(400, `Supplementary Qty (${qty}) cannot exceed Remaining Pending Qty (${remaining}).`);
    }

    const startFromSeq = Number(value.startFromSeq);
    const startStage = (section.stages || []).find((s) => Number(s.seq) === startFromSeq);
    if (!startStage) throw new ApiError(400, `Start From Stage ${startFromSeq} is not on this Section Work Order`);

    const created = await createSupplementaryWorkOrderDocument(section, [{ mat, qty }], {
        startFromSeq,
        startStage,
        supervisor: value.supervisor,
        remarks: value.remarks,
        reason: value.reason,
        userId: req.user._id,
    });

    res.status(201).json(new ApiResponse(201, created, `Supplementary Work Order ${created.woNumber} created (process tracking only — no stock posting)`));
});

const assertSectionAcceptsSupplementary = (section) => {
    if (!section) throw new ApiError(404, 'Work Order not found');
    if (!isSectionWorkOrder(section)) {
        throw new ApiError(400, 'Supplementary Work Orders can only be created from a Section Work Order');
    }
    if (['Closed', 'Cancelled'].includes(section.status)) {
        throw new ApiError(400, `Cannot create a Supplementary WO under a ${section.status} Section WO`);
    }
};

const validateSupplementaryLineQty = (mat, qty) => {
    const n = Number(qty);
    const remaining = getRemainingPendingQty(mat);
    const label = lateMaterialItemLabel(mat);
    if (!(n > 0)) throw new ApiError(400, `${label}: Supplementary Qty must be greater than 0`);
    if (n > remaining) {
        throw new ApiError(400, `${label} cannot be recorded: Qty ${n} exceeds Remaining To Allocate ${remaining}.`);
    }
};

const createSupplementaryWorkOrderDocument = async (section, lines, { startFromSeq, startStage, supervisor, remarks, reason, userId, session = null, skipAllocate = false, sourceMaterialIssueId = null, materialIssueNo = '' }) => {
    const processQty = Math.max(...lines.map((l) => Number(l.qty) || 0));
    const existingQ = WorkOrder.find({
        sourceSectionWorkOrderId: section._id,
        woKind: SUPPLEMENTARY_WO_KIND,
    }).select('woNumber').lean();
    if (session) existingQ.session(session);
    const existing = await existingQ;
    const woNumber = buildSupplementaryWoNumber(section.woNumber, nextSupplementaryIndex(existing.map((w) => w.woNumber)));
    const clashQ = WorkOrder.findOne({ woNumber });
    if (session) clashQ.session(session);
    const clash = await clashQ;
    if (clash) throw new ApiError(400, `Work Order Number ${woNumber} already exists`);

    const missingMaterialInstruction = !!skipAllocate || !!sourceMaterialIssueId;
    const stages = missingMaterialInstruction
        ? []
        : cloneStagesForSupplementary(section.stages, PRODUCTION_STAGES, startFromSeq, processQty);
    if (!Array.isArray(section.materialEventHistory)) section.materialEventHistory = [];

    for (const { mat, qty } of lines) {
        if (skipAllocate) {
            if (getSupplementaryAllocatedQty(mat) <= 0) mat.supplementaryAllocatedQty = qty;
        } else {
            mat.supplementaryAllocatedQty = getSupplementaryAllocatedQty(mat) + qty;
        }
    }

    const doc = {
        woNumber,
        woKind: SUPPLEMENTARY_WO_KIND,
        parentWorkOrderId: section.parentWorkOrderId,
        sourceSectionWorkOrderId: section._id,
        sourceMaterialIssueId: sourceMaterialIssueId || null,
        materialIssueNo: materialIssueNo || '',
        startFromSeq: missingMaterialInstruction ? null : startFromSeq,
        startFromStageName: missingMaterialInstruction ? '' : (startStage?.stageName || ''),
        supplementaryReason: reason || DEFAULT_SUPPLEMENTARY_REASON,
        supplementaryMaterials: lines.map(({ mat, qty }) => ({
            materialId: mat._id,
            itemId: mat.itemId,
            itemCode: mat.itemCode || '',
            itemName: mat.itemName || '',
            qty,
        })),
        bomId: section.bomId,
        finishedProductId: section.finishedProductId,
        finishedProductName: section.finishedProductName,
        bomVersion: section.bomVersion,
        bomSectionNo: section.bomSectionNo,
        bomSectionName: section.bomSectionName,
        requiredQtyPerFinishedUnit: section.requiredQtyPerFinishedUnit,
        isMandatorySection: false,
        targetQty: processQty,
        priority: section.priority,
        supervisor: supervisor || section.supervisor || '',
        remarks: remarks || '',
        productionModule: section.productionModule || 'electronics',
        stages,
        materialStatus: lines.map(({ mat, qty }) => ({
            itemId: mat.itemId,
            itemCode: mat.itemCode || '',
            itemName: mat.itemName || '',
            itemType: mat.itemType,
            uom: mat.uom || '',
            requiredQty: qty,
            availableStock: mat.availableStock,
            reservedQty: 0,
            shortQty: 0,
            isMandatory: true,
            bomIsMandatory: true,
            sectionNo: mat.sectionNo,
            sectionName: mat.sectionName || section.bomSectionName || '',
            consumptionStage: mat.consumptionStage || '',
            procurementStatus: mat.procurementStatus || 'Not Ordered',
            remarks: remarks || '',
        })),
        financialYear: section.financialYear,
        inventorySynced: false,
        status: missingMaterialInstruction ? 'Pending' : 'Released',
        createdBy: userId,
    };

    const created = session
        ? (await WorkOrder.create([doc], { session }))[0]
        : await WorkOrder.create(doc);

    for (const { mat, qty } of lines) {
        section.materialEventHistory.push(buildMaterialEventEntry({
            eventType: 'supplementary_created',
            material: mat,
            qty,
            remainingPendingQty: getRemainingPendingQty(mat),
            remainingToAllocateQty: getRemainingPendingQty(mat),
            remainingToResolveQty: getRemainingToResolveQty(mat),
            userId,
            remarks: remarks || reason || DEFAULT_SUPPLEMENTARY_REASON,
            supplementaryWorkOrderId: created._id,
            supplementaryWoNumber: created.woNumber,
        }));
    }
    section.updatedBy = userId;
    if (session) await section.save({ session });
    else await section.save();
    return created;
};

// ────────────────────────────────────────────────────────────────────────────
// POST /work-orders/:id/supplementary-work-orders/bulk
// One SUP WO for selected pending lines. Same Phase 1 architecture — no stock.
// ────────────────────────────────────────────────────────────────────────────
export const createSupplementaryWorkOrderBulk = asyncHandler(async (req, res) => {
    assertLateMaterialWritePermission(req);
    const { error, value } = createSupplementaryWorkOrderBulkSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const section = await WorkOrder.findById(req.params.id).session(session);
        assertSectionAcceptsSupplementary(section);

        const startFromSeq = Number(value.startFromSeq);
        const startStage = (section.stages || []).find((s) => Number(s.seq) === startFromSeq);
        if (!startStage) throw new ApiError(400, `Start From Stage ${startFromSeq} is not on this Section Work Order`);

        const seen = new Set();
        const lines = [];
        for (const row of value.items) {
            const id = String(row.materialId);
            if (seen.has(id)) throw new ApiError(400, 'The same component cannot be included twice in one Supplementary WO.');
            seen.add(id);
            const mat = section.materialStatus.id(row.materialId);
            if (!mat) throw new ApiError(404, 'Component not found on this Section Work Order');
            validateSupplementaryLineQty(mat, row.qty);
            lines.push({ mat, qty: Number(row.qty) });
        }

        const created = await createSupplementaryWorkOrderDocument(section, lines, {
            startFromSeq,
            startStage,
            supervisor: value.supervisor,
            remarks: value.remarks,
            reason: value.reason,
            userId: req.user._id,
            session,
        });

        await session.commitTransaction();
        res.status(201).json(new ApiResponse(201, created, `Supplementary Work Order ${created.woNumber} created for ${lines.length} component(s) (process tracking only — no stock posting)`));
    } catch (e) {
        await session.abortTransaction();
        throw e;
    } finally {
        session.endSession();
    }
});

const linkOrCreateSupplementaryFromPostedBatch = async (section, batch, { startFromSeq, supervisor, remarks, reason, userId, session }) => {
    if (batch.supplementaryWorkOrderId) {
        const existing = await WorkOrder.findById(batch.supplementaryWorkOrderId).session(session);
        if (existing) return existing;
    }
    const seq = Number(startFromSeq);
    const startStage = (section.stages || []).find((s) => Number(s.seq) === seq);
    if (!startStage) throw new ApiError(400, `Start From Stage ${startFromSeq || ''} is required to create a Supplementary WO. No material was issued.`);

    const lines = [];
    for (const row of batch.lines || []) {
        const mat = resolveSectionMaterialLine(section.materialStatus, row.materialId, row)
            || section.materialStatus.find((m) => String(m.itemId) === String(row.itemId));
        if (!mat) {
            throw new ApiError(400, `Material line ${row.itemCode || row.itemName || 'unknown'} could not be linked to the source Work Order. No material was issued.`);
        }
        const qty = Number(row.qtyIssued);
        if (!(qty > 0)) throw new ApiError(400, `${row.itemCode || mat.itemCode}: issued qty is missing. No material was issued.`);
        lines.push({ mat, qty });
    }
    if (!lines.length) throw new ApiError(400, 'Material Issue has no lines. No material was issued.');

    const created = await createSupplementaryWorkOrderDocument(section, lines, {
        startFromSeq: seq,
        startStage,
        supervisor: supervisor || batch.supervisor || section.supervisor || '',
        remarks: remarks || `Linked to Material Issue ${batch.issueNo}`,
        reason: reason || 'Missing material received later and added to production',
        userId,
        session,
        skipAllocate: true,
        sourceMaterialIssueId: batch._id,
    });
    batch.supplementaryWorkOrderId = created._id;
    batch.supplementaryWoNumber = created.woNumber;
    await section.save({ session });
    return created;
};

const stampIssueLinesToSupplementary = (batch, materials, dest) => {
    const ids = new Set((materials || []).map((m) => String(m._id)));
    for (const line of batch.lines || []) {
        if (line.materialId && ids.has(String(line.materialId))) {
            line.supplementaryWorkOrderId = dest._id;
            line.supplementaryWoNumber = dest.woNumber || '';
        }
    }
};

const appendIssuedLinesToExistingSupplementary = async (section, sup, lines, { userId, remarks, reason, session, sourceMaterialIssueId, materialIssueNo = '' }) => {
    if (!Array.isArray(sup.supplementaryMaterials)) sup.supplementaryMaterials = [];
    if (!Array.isArray(sup.materialStatus)) sup.materialStatus = [];
    if (!Array.isArray(section.materialEventHistory)) section.materialEventHistory = [];
    for (const { mat, qty } of lines) {
        const already = (sup.supplementaryMaterials || []).some((sm) =>
            (mat?._id && String(sm.materialId) === String(mat._id))
            || (mat?.itemCode && sm.itemCode && sm.itemCode === mat.itemCode)
        );
        if (already) continue;
        if (getSupplementaryAllocatedQty(mat) <= 0) mat.supplementaryAllocatedQty = qty;
        sup.supplementaryMaterials.push({
            materialId: mat._id,
            itemId: mat.itemId,
            itemCode: mat.itemCode || '',
            itemName: mat.itemName || '',
            qty,
        });
        sup.materialStatus.push({
            itemId: mat.itemId,
            itemCode: mat.itemCode || '',
            itemName: mat.itemName || '',
            itemType: mat.itemType,
            uom: mat.uom || '',
            requiredQty: qty,
            availableStock: mat.availableStock,
            reservedQty: 0,
            shortQty: 0,
            isMandatory: true,
            bomIsMandatory: true,
            sectionNo: mat.sectionNo,
            sectionName: mat.sectionName || section.bomSectionName || '',
            consumptionStage: mat.consumptionStage || '',
            procurementStatus: mat.procurementStatus || 'Not Ordered',
            remarks: remarks || '',
        });
        section.materialEventHistory.push(buildMaterialEventEntry({
            eventType: 'supplementary_linked',
            material: mat,
            qty,
            remainingPendingQty: getRemainingPendingQty(mat),
            remainingToAllocateQty: getRemainingPendingQty(mat),
            remainingToResolveQty: getRemainingToResolveQty(mat),
            userId,
            remarks: remarks || reason || 'Missing material added to existing Supplementary WO',
            supplementaryWorkOrderId: sup._id,
            supplementaryWoNumber: sup.woNumber,
        }));
    }
    if (sourceMaterialIssueId && !sup.sourceMaterialIssueId) {
        sup.sourceMaterialIssueId = sourceMaterialIssueId;
    }
    if (materialIssueNo && !sup.materialIssueNo) sup.materialIssueNo = materialIssueNo;
    await sup.save({ session });
    return sup;
};

const applySupplementaryDestinationsForIssuedBatch = async (section, batch, { items, existingSups, startFromSeq, supervisor, remarks, reason, userId, session }) => {
    const selected = [];
    const qtyById = new Map();
    for (const row of items || []) {
        const mat = resolveSectionMaterialLine(section.materialStatus, row.materialId, row);
        if (!mat) {
            throw new ApiError(400, `Material line ${row.materialId} could not be linked to the source Work Order. No material was issued.`);
        }
        selected.push(mat);
        qtyById.set(String(mat._id), Number(row.qtyIssued || row.qty) || 0);
    }
    const groups = groupSelectedMaterialsBySupplementary(selected, existingSups);
    const destinations = [];

    for (const group of groups.assigned) {
        const destDoc = existingSups.find((s) => String(s._id) === String(group.dest._id)) || group.dest;
        stampIssueLinesToSupplementary(batch, group.materials, destDoc);
        destinations.push({
            workOrderId: destDoc._id,
            woNumber: destDoc.woNumber,
            created: false,
            joined: false,
            materialCount: group.materials.length,
        });
    }

    if (groups.unassigned.length) {
        const selectionSups = groups.assigned.map((g) => existingSups.find((s) => String(s._id) === String(g.dest._id)) || g.dest);
        const plan = resolveUnassignedSupplementaryPlan(groups.unassigned, selectionSups, {
            sectionId: section._id,
            startFromSeq,
        });
        const unassignedLines = groups.unassigned.map((mat) => ({ mat, qty: qtyById.get(String(mat._id)) }));
        if (unassignedLines.some((l) => !(l.qty > 0))) {
            throw new ApiError(400, 'Qty To Add must be greater than 0 for every selected component. No material was issued.');
        }
        if (plan.action === 'join' && plan.sup) {
            const destDoc = existingSups.find((s) => String(s._id) === String(plan.sup._id)) || plan.sup;
            await appendIssuedLinesToExistingSupplementary(section, destDoc, unassignedLines, {
                userId,
                remarks,
                reason,
                session,
                sourceMaterialIssueId: batch._id,
                materialIssueNo: batch.issueNo || '',
            });
            stampIssueLinesToSupplementary(batch, groups.unassigned, destDoc);
            const existing = destinations.find((d) => String(d.workOrderId) === String(destDoc._id));
            if (existing) {
                existing.joined = true;
                existing.materialCount += unassignedLines.length;
            } else {
                destinations.push({
                    workOrderId: destDoc._id,
                    woNumber: destDoc.woNumber,
                    created: false,
                    joined: true,
                    materialCount: unassignedLines.length,
                });
            }
        } else {
            const created = await createSupplementaryWorkOrderDocument(section, unassignedLines, {
                startFromSeq: startFromSeq || null,
                startStage: null,
                supervisor: supervisor || batch.supervisor || section.supervisor || '',
                remarks: remarks || `Linked to Material Issue ${batch.issueNo}`,
                reason: reason || 'Missing material received later and added to production',
                userId,
                session,
                skipAllocate: true,
                sourceMaterialIssueId: batch._id,
                materialIssueNo: batch.issueNo || '',
            });
            stampIssueLinesToSupplementary(batch, groups.unassigned, created);
            destinations.push({
                workOrderId: created._id,
                woNumber: created.woNumber,
                created: true,
                joined: false,
                materialCount: unassignedLines.length,
            });
        }
    }

    batch.destinations = destinations;
    if (destinations.length === 1) {
        batch.supplementaryWorkOrderId = destinations[0].workOrderId;
        batch.supplementaryWoNumber = destinations[0].woNumber;
    } else if (destinations.length > 1) {
        batch.supplementaryWorkOrderId = destinations[0].workOrderId;
        batch.supplementaryWoNumber = destinations.map((d) => d.woNumber).filter(Boolean).join(', ');
    }
    return destinations;
};

// ────────────────────────────────────────────────────────────────────────────
// POST /work-orders/:id/materials/add-missing-to-product
// One transaction: stock issue + reuse/create Supplementary WO groups. No second deduction.
// ────────────────────────────────────────────────────────────────────────────
export const addMissingMaterialToProduct = asyncHandler(async (req, res) => {
    assertLateMaterialWritePermission(req);
    const { error, value } = addMissingMaterialToProductSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const wo = await WorkOrder.findById(req.params.id).session(session);
        assertWoAcceptsLateMaterial(wo);
        if (!isSectionWorkOrder(wo)) {
            throw new ApiError(400, 'Add Missing Material to Product is only available on a Section Work Order.');
        }

        const existingSups = await WorkOrder.find({
            sourceSectionWorkOrderId: wo._id,
            woKind: SUPPLEMENTARY_WO_KIND,
            status: { $nin: ['Cancelled'] },
        }).session(session);

        const result = await issueLateMaterialBatch({
            wo,
            items: value.items,
            remarks: value.remarks || '',
            idempotencyKey: value.idempotencyKey || '',
            userId: req.user._id,
            companyId: req.companyId || null,
            session,
        });
        if (!result.reused) {
            wo.updatedBy = req.user._id;
        }

        let destinations = (result.batch.destinations || []).map((d) => ({
            workOrderId: d.workOrderId || d._id,
            woNumber: d.woNumber,
            created: !!d.created,
            joined: !!d.joined,
            materialCount: Number(d.materialCount) || 0,
        }));
        if (!result.reused || !destinations.length) {
            destinations = await applySupplementaryDestinationsForIssuedBatch(wo, result.batch, {
                items: value.items,
                existingSups,
                startFromSeq: value.startFromSeq,
                supervisor: value.supervisor,
                remarks: value.remarks,
                reason: value.reason,
                userId: req.user._id,
                session,
            });
        }
        await wo.save({ session });

        const supplementaryDestinations = destinations.map((d) => ({
            _id: d.workOrderId,
            woNumber: d.woNumber,
            created: !!d.created,
            joined: !!d.joined,
            materialCount: Number(d.materialCount) || 0,
        }));
        const supplementaryWo = supplementaryDestinations[0]
            ? await WorkOrder.findById(supplementaryDestinations[0]._id).session(session)
            : null;

        await session.commitTransaction();
        const destLabel = supplementaryDestinations.map((d) => d.woNumber).filter(Boolean).join(' + ') || 'Supplementary WO';
        res.json(new ApiResponse(200, {
            workOrder: result.wo,
            batch: serializeMaterialIssueBatch(result.batch),
            supplementaryWo,
            supplementaryDestinations,
            reused: !!result.reused,
        }, result.reused
            ? `Material Issue ${result.batch.issueNo} already posted. Stock was not deducted again.`
            : `Missing material added. Issue ${result.batch.issueNo} linked to ${destLabel}.`));
    } catch (e) {
        await session.abortTransaction();
        throw e;
    } finally {
        session.endSession();
    }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /work-orders/:id/material-issues/:batchId/supplementary-work-order
// Process-only SUP from an already posted Material Issue. Does not deduct stock.
// ────────────────────────────────────────────────────────────────────────────
export const createSupplementaryFromMaterialIssue = asyncHandler(async (req, res) => {
    assertLateMaterialWritePermission(req);
    const { error, value } = createSupplementaryFromMaterialIssueSchema.validate(req.body);
    if (error) throw new ApiError(400, error.details[0].message);

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const section = await WorkOrder.findById(req.params.id).session(session);
        assertSectionAcceptsSupplementary(section);

        const batch = findIssueOnWorkOrder(section, { batchId: req.params.batchId });
        if (!batch || (batch.status && batch.status !== 'Posted')) {
            throw new ApiError(404, 'Material Issue was not found or is not posted. Supplementary WO was not created.');
        }
        const belongs = [batch.sectionWorkOrderId, batch.stockReferenceId, batch.parentWorkOrderId]
            .filter(Boolean)
            .some((id) => String(id) === String(section._id))
            || String(section._id) === String(req.params.id);
        if (!belongs) {
            throw new ApiError(400, 'This Material Issue does not belong to this Section Work Order.');
        }
        if (batch.supplementaryWorkOrderId) {
            const existing = await WorkOrder.findById(batch.supplementaryWorkOrderId).session(session);
            if (existing) {
                await session.commitTransaction();
                return res.json(new ApiResponse(200, existing, `Supplementary WO ${existing.woNumber} is already linked to ${batch.issueNo}. Stock was not deducted again.`));
            }
        }

        const startFromSeq = Number(value.startFromSeq);
        const startStage = (section.stages || []).find((s) => Number(s.seq) === startFromSeq);
        if (!startStage) throw new ApiError(400, `Start From Stage ${startFromSeq} is not on this Section Work Order`);

        const lines = [];
        for (const row of batch.lines || []) {
            const mat = section.materialStatus.id(row.materialId)
                || section.materialStatus.find((m) => String(m.itemId) === String(row.itemId));
            if (!mat) throw new ApiError(404, `${row.itemCode || row.itemName || 'Component'} is not on this Section Work Order`);
            const qty = Number(row.qtyIssued);
            if (!(qty > 0)) throw new ApiError(400, `${row.itemCode || mat.itemCode}: issued qty is missing. Supplementary WO was not created.`);
            lines.push({ mat, qty });
        }
        if (!lines.length) throw new ApiError(400, 'Material Issue has no lines. Supplementary WO was not created.');

        const created = await createSupplementaryWorkOrderDocument(section, lines, {
            startFromSeq,
            startStage,
            supervisor: value.supervisor || batch.supervisor || section.supervisor || '',
            remarks: value.remarks || `Linked to Material Issue ${batch.issueNo}`,
            reason: value.reason || 'Late material received and issued after original production started',
            userId: req.user._id,
            session,
            skipAllocate: true,
            sourceMaterialIssueId: batch._id,
        });

        batch.supplementaryWorkOrderId = created._id;
        batch.supplementaryWoNumber = created.woNumber;
        await section.save({ session });

        await session.commitTransaction();
        res.status(201).json(new ApiResponse(201, created, `Supplementary Work Order ${created.woNumber} created from ${batch.issueNo} (process tracking only — stock was not deducted again)`));
    } catch (e) {
        await session.abortTransaction();
        throw e;
    } finally {
        session.endSession();
    }
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

    const supplementaryCount = await WorkOrder.countDocuments({
        sourceSectionWorkOrderId: wo._id,
        woKind: SUPPLEMENTARY_WO_KIND,
    });
    if (canHardDeleteSectionWorkOrder(wo, { supplementaryCount })) {
        await WorkOrder.findByIdAndDelete(wo._id);
        return res.json(new ApiResponse(200, null, 'Draft Section Work Order deleted. The same section number can be created again.'));
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

    if (isSectionWorkOrder(wo)) {
        const supplementaryCount = await WorkOrder.countDocuments({
            sourceSectionWorkOrderId: wo._id,
            woKind: SUPPLEMENTARY_WO_KIND,
        });
        if (!canHardDeleteSectionWorkOrder(wo, { supplementaryCount })) {
            throw new ApiError(400, 'This Section Work Order has production history. Cancel or Restore it instead of deleting.');
        }
        await WorkOrder.findByIdAndDelete(wo._id);
        return res.json(new ApiResponse(200, null, 'Draft Section Work Order deleted'));
    }

    if (!isSupplementaryWorkOrder(wo)) {
        const children = await WorkOrder.find({ parentWorkOrderId: wo._id, woKind: SECTION_WO_KIND });
        const extrasById = {};
        for (const child of children) {
            extrasById[String(child._id)] = {
                supplementaryCount: await WorkOrder.countDocuments({
                    sourceSectionWorkOrderId: child._id,
                    woKind: SUPPLEMENTARY_WO_KIND,
                }),
            };
        }
        const { cascade, blocking } = classifyParentDeleteSectionChildren(children, extrasById);
        if (blocking.length) {
            throw new ApiError(400, buildParentDeleteBlockedMessage(blocking[0]));
        }
        for (const child of cascade) {
            await WorkOrder.findByIdAndDelete(child._id);
        }
    }

    await WorkOrder.findByIdAndDelete(req.params.id);
    res.json(new ApiResponse(200, null, 'Work Order deleted'));
});

export const getStageMaterialConsumption = asyncHandler(async (req, res) => {
    const wo = await WorkOrder.findById(req.params.id).select('woNumber woKind parentWorkOrderId sourceSectionWorkOrderId financialYear');
    if (!wo) throw new ApiError(404, 'Work Order not found');
    const rows = await listStageMaterialConsumption(wo);
    res.json(new ApiResponse(200, rows, 'Stage material consumption'));
});

// ────────────────────────────────────────────────────────────────────────────
// PATCH /work-orders/:id/complete-material-addition
// Marks missing-material Supplementary WO Completed. No stock / FG posting.
// ────────────────────────────────────────────────────────────────────────────
export const completeMaterialAddition = asyncHandler(async (req, res) => {
    assertLateMaterialWritePermission(req);
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const wo = await WorkOrder.findById(req.params.id).session(session);
        if (!wo) throw new ApiError(404, 'Work Order not found');
        if (!isSupplementaryWorkOrder(wo)) {
            throw new ApiError(400, 'Mark Material Addition Completed is only available on a Supplementary Work Order.');
        }
        if (wo.status === 'Completed') {
            await session.commitTransaction();
            return res.json(new ApiResponse(200, wo, `Supplementary WO ${wo.woNumber} is already completed. Stock was not deducted.`));
        }
        if (['Cancelled', 'Closed'].includes(wo.status)) {
            throw new ApiError(400, `Cannot complete a ${wo.status} Supplementary WO.`);
        }
        wo.status = 'Completed';
        wo.actualEnd = new Date();
        wo.updatedBy = req.user._id;
        await applySupplementaryCompletionToSource(wo, req.user._id, session);
        await wo.save({ session });
        await session.commitTransaction();
        res.json(new ApiResponse(200, wo, `Material addition marked completed on ${wo.woNumber}. Stock was not deducted.`));
    } catch (e) {
        await session.abortTransaction();
        throw e;
    } finally {
        session.endSession();
    }
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
