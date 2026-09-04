/**
 * Phase 1 BOM Section / Subassembly Work Orders — pure helpers.
 * Section WOs are process-tracking only: they must never drive stock, reservation, or FG posting.
 */

export const MAIN_WO_KIND = 'main';
export const SECTION_WO_KIND = 'section';
export const SUPPLEMENTARY_WO_KIND = 'supplementary';
export const NA_STAGE_REMARK = 'Not Applicable — completed in original WO';
export const DEFAULT_SUPPLEMENTARY_REASON = 'Pending material received later';

export const EXCLUDE_SECTION_WO = { woKind: { $nin: [SECTION_WO_KIND, SUPPLEMENTARY_WO_KIND] } };

export function isSectionWorkOrder(wo) {
    return wo?.woKind === SECTION_WO_KIND;
}

export function isSupplementaryWorkOrder(wo) {
    return wo?.woKind === SUPPLEMENTARY_WO_KIND;
}

export function isProcessOnlyWorkOrder(wo) {
    return isSectionWorkOrder(wo) || isSupplementaryWorkOrder(wo);
}

export function isSectionTrackingEnabled(wo) {
    return wo?.sectionConfig?.enabled === true;
}

export function buildSectionWoNumber(parentWoNumber, sectionNo) {
    const parent = String(parentWoNumber || '').trim().toUpperCase();
    const no = Number(sectionNo);
    return `${parent}-S${no}`;
}

/** Main WO series matcher: WO-{fy}-{digits} only — never Parent-S1 suffixes. */
export function mainWoNumberSeriesRegex(prefix) {
    return new RegExp(`^${prefix}\\d+$`);
}

export function isApplicableStage(stage) {
    if (!stage) return false;
    if (stage.notApplicable === true) return false;
    if (stage.isApplicable === false) return false;
    return true;
}

/** N/A supplementary prefix stages must not count as fresh production output. */
export function getReportableStageOutput(stage) {
    if (!isApplicableStage(stage)) return 0;
    return Math.max(0, Number(stage?.outputQty) || 0);
}

export function getAuthoritativeCompletedQty(wo) {
    if (!wo || wo.status === 'Cancelled') return 0;
    const stages = Array.isArray(wo.stages) ? wo.stages : [];
    if (!stages.length) return 0;
    const applicable = stages.filter(isApplicableStage);
    const source = applicable.length ? applicable : stages;

    const finalQc = source.find((s) => Number(s.seq) === 9)
        || (() => {
            const qc = source.filter((s) => s.isQcGate);
            if (!qc.length) return null;
            return qc.reduce((a, b) => (Number(b.seq) > Number(a.seq) ? b : a));
        })();
    const last = source.reduce((a, b) => (Number(b.seq) > Number(a.seq) ? b : a), source[0]);
    const stage = finalQc || last;
    return getReportableStageOutput(stage);
}

export function getCurrentStageName(wo) {
    if (!wo || wo.status === 'Cancelled') return wo?.status === 'Cancelled' ? 'Cancelled' : '—';
    const stages = Array.isArray(wo.stages) ? wo.stages : [];
    if (!stages.length) return '—';
    const allDone = stages.every((s) => s.status === 'Completed');
    if (allDone) return 'Complete';
    const running = stages.find((s) => s.status === 'Running' || s.status === 'QC Hold' || s.status === 'Rework');
    if (running) return running.stageName;
    const next = stages.find((s) => s.status !== 'Completed');
    return next?.stageName || '—';
}

export function availableSetsForSection(completedSectionQty, requiredQtyPerFinishedUnit = 1) {
    const req = Number(requiredQtyPerFinishedUnit) > 0 ? Number(requiredQtyPerFinishedUnit) : 1;
    const completed = Number(completedSectionQty) || 0;
    if (completed < 0) return 0;
    return Math.floor(completed / req);
}

/**
 * Complete Sets Available = MIN(mandatory section available sets).
 * Missing / cancelled mandatory section WO contributes 0 sets.
 */
export function computeCompleteSetsAvailable({
    parentTargetQty = 0,
    mandatorySections = [],
    sectionWorkOrders = [],
} = {}) {
    if (!Array.isArray(mandatorySections) || mandatorySections.length === 0) {
        return {
            gated: false,
            completeSetsAvailable: Number(parentTargetQty) || 0,
            parentTargetQty: Number(parentTargetQty) || 0,
            sectionRows: [],
        };
    }

    const sectionRows = mandatorySections.map((sec) => {
        const sectionNo = Number(sec.bomSectionNo);
        const requiredQtyPerFinishedUnit = Number(sec.requiredQtyPerFinishedUnit) > 0
            ? Number(sec.requiredQtyPerFinishedUnit)
            : 1;
        const wo = (sectionWorkOrders || []).find(
            (s) => Number(s.bomSectionNo) === sectionNo && s.status !== 'Cancelled'
        );
        const cancelled = (sectionWorkOrders || []).some(
            (s) => Number(s.bomSectionNo) === sectionNo && s.status === 'Cancelled'
        ) && !wo;
        const completedQty = wo ? getAuthoritativeCompletedQty(wo) : 0;
        const availableSets = wo ? availableSetsForSection(completedQty, requiredQtyPerFinishedUnit) : 0;
        return {
            bomSectionNo: sectionNo,
            bomSectionName: sec.bomSectionName || wo?.bomSectionName || '',
            requiredQtyPerFinishedUnit,
            isMandatory: true,
            sectionWorkOrderId: wo?._id || null,
            woNumber: wo?.woNumber || null,
            status: wo?.status || (cancelled ? 'Cancelled' : 'Not created'),
            targetQty: wo?.targetQty ?? null,
            completedQty,
            availableSets,
            currentStage: wo ? getCurrentStageName(wo) : (cancelled ? 'Cancelled' : '—'),
        };
    });

    const completeSetsAvailable = sectionRows.length
        ? Math.min(...sectionRows.map((r) => r.availableSets))
        : 0;

    return {
        gated: true,
        completeSetsAvailable,
        parentTargetQty: Number(parentTargetQty) || 0,
        sectionRows,
    };
}

export function buildFinalCompletionBlockMessage(requestedQty, completeSetsAvailable) {
    const req = Number(requestedQty) || 0;
    const avail = Number(completeSetsAvailable) || 0;
    return `Cannot complete ${req} units. Only ${avail} mandatory subassembly sets are available.`;
}

export function assertFinalQtyAllowed(requestedQty, completeSetsAvailable) {
    const req = Number(requestedQty) || 0;
    const avail = Number(completeSetsAvailable) || 0;
    if (req > avail) {
        const err = new Error(buildFinalCompletionBlockMessage(req, avail));
        err.statusCode = 400;
        throw err;
    }
}

/** Same qty inventory.service uses for FG posting. */
export function getInventorySyncQty(wo) {
    const stages = Array.isArray(wo?.stages) ? wo.stages : [];
    const finalQcStage = stages.find((s) => Number(s.seq) === 9);
    if (finalQcStage && Number(finalQcStage.outputQty) > 0) return Number(finalQcStage.outputQty);
    return Number(wo?.targetQty) || 0;
}

export function isFinalCompletionStage(wo, seq) {
    const stages = Array.isArray(wo?.stages) ? wo.stages : [];
    if (!stages.length) return Number(seq) === 9;
    const lastSeq = Math.max(...stages.map((s) => Number(s.seq) || 0));
    const n = Number(seq);
    return n === 9 || n === lastSeq;
}

export function filterBomComponentsBySection(components, sectionNo) {
    const no = Number(sectionNo);
    return (components || []).filter((c) => Number(c.sectionNo) === no);
}

export function cloneStagesForSectionWo(parentStages, fallbackStages = []) {
    const source = (Array.isArray(parentStages) && parentStages.length) ? parentStages : fallbackStages;
    return source.map((s) => ({
        seq: s.seq,
        stageName: s.stageName,
        isQcGate: !!s.isQcGate,
        isTestGate: !!s.isTestGate,
        status: 'Not Started',
        inputQty: 0,
        outputQty: 0,
        reworkQty: 0,
        rejectionQty: 0,
        rejectionReason: '',
        productionLogs: [],
        checklist: (s.checklist || []).map((c) => ({
            item: c.item,
            result: 'Pending',
            remarks: '',
        })),
        remarks: '',
        attachments: [],
    }));
}

export function shouldSyncWorkOrderInventory(wo) {
    if (!wo) return false;
    if (isProcessOnlyWorkOrder(wo)) return false;
    return wo.status === 'Completed' && !wo.inventorySynced;
}

export function buildSupplementaryWoNumber(sectionWoNumber, index) {
    return `${String(sectionWoNumber || '').trim().toUpperCase()}-SUP${Number(index)}`;
}

export function parseSupplementaryIndex(woNumber) {
    const m = String(woNumber || '').match(/-SUP(\d+)$/i);
    return m ? parseInt(m[1], 10) : 0;
}

export function nextSupplementaryIndex(existingWoNumbers = []) {
    let max = 0;
    for (const n of existingWoNumbers) {
        max = Math.max(max, parseSupplementaryIndex(n));
    }
    return max + 1;
}

export function cloneStagesForSupplementary(sourceStages, fallbackStages, startFromSeq, targetQty) {
    const cloned = cloneStagesForSectionWo(sourceStages, fallbackStages);
    const start = Number(startFromSeq);
    const qty = Math.max(0, Number(targetQty) || 0);
    return cloned.map((s) => {
        if (Number.isFinite(start) && Number(s.seq) < start) {
            return {
                ...s,
                status: 'Completed',
                inputQty: qty,
                outputQty: qty,
                remarks: NA_STAGE_REMARK,
                notApplicable: true,
                isApplicable: false,
            };
        }
        return { ...s, notApplicable: false, isApplicable: true };
    });
}

export function getAddedLaterQty(m) {
    return Math.max(0, Number(m?.addedLaterQty) || 0);
}

export function getSupplementaryAllocatedQty(m) {
    return Math.max(0, Number(m?.supplementaryAllocatedQty) || 0);
}

export function getSupplementaryCompletedQty(m) {
    return Math.max(0, Number(m?.supplementaryCompletedQty) || 0);
}

export function isLateMaterialLine(m) {
    return isDeferredMaterial(m)
        || getAddedLaterQty(m) > 0
        || getSupplementaryAllocatedQty(m) > 0
        || getSupplementaryCompletedQty(m) > 0;
}

/** Remaining qty still open for Record Late Material or a new Supplementary WO. */
export function getRemainingToAllocateQty(m) {
    if (!isLateMaterialLine(m)) return 0;
    const req = Math.max(0, Number(m?.requiredQty) || 0);
    return Math.max(0, req - getAddedLaterQty(m) - getSupplementaryAllocatedQty(m));
}

/** Remaining qty not yet covered by added-later + completed supplementary. */
export function getRemainingToResolveQty(m) {
    if (!isLateMaterialLine(m)) return 0;
    const req = Math.max(0, Number(m?.requiredQty) || 0);
    return Math.max(0, req - getAddedLaterQty(m) - getSupplementaryCompletedQty(m));
}

/** @deprecated Use getRemainingToAllocateQty. Kept so Add/SUP APIs stay quantity-safe. */
export function getRemainingPendingQty(m) {
    return getRemainingToAllocateQty(m);
}

export function getResolvedMaterialQty(m) {
    if (!isLateMaterialLine(m)) return Math.max(0, Number(m?.requiredQty) || 0);
    return Math.min(
        Math.max(0, Number(m?.requiredQty) || 0),
        getAddedLaterQty(m) + getSupplementaryCompletedQty(m)
    );
}

export function shouldMarkFullyResolved(m) {
    const req = Math.max(0, Number(m?.requiredQty) || 0);
    if (req <= 0) return false;
    return getRemainingToResolveQty(m) === 0
        && getSupplementaryAllocatedQty(m) <= getSupplementaryCompletedQty(m);
}

/**
 * Parent FG cap from original BOM requirement vs qty resolved on current WO / completed SUPs.
 * Non-late required shorts still cap FG at 0.
 */
export function getMaxMaterialCompleteFgQty({
    parentTargetQty = 0,
    parentMaterials = [],
    sectionWorkOrders = [],
} = {}) {
    let maxFg = Math.max(0, Number(parentTargetQty) || 0);
    const lines = [...(parentMaterials || [])];
    for (const child of sectionWorkOrders || []) {
        for (const m of child.materialStatus || []) lines.push(m);
    }
    for (const m of lines) {
        if (!isBomRequiredMaterial(m)) continue;
        if (isLateMaterialLine(m)) {
            maxFg = Math.min(maxFg, getResolvedMaterialQty(m));
            continue;
        }
        if (Number(m.shortQty) > 0) maxFg = 0;
    }
    return Math.max(0, maxFg);
}

export function buildMaterialCompleteFgBlockMessage(requestedQty, maxFg) {
    const req = Number(requestedQty) || 0;
    const avail = Number(maxFg) || 0;
    return `Cannot complete ${req} units. Only ${avail} units are material-complete.`;
}

export function collectLateMaterialLines(parentMaterials = [], sectionWorkOrders = []) {
    const lines = [...(parentMaterials || [])];
    for (const child of sectionWorkOrders || []) {
        for (const m of child.materialStatus || []) lines.push(m);
    }
    return lines.filter((m) => isBomRequiredMaterial(m) && isLateMaterialLine(m));
}

/** True when any required late-material line still has Remaining to Resolve > 0. */
export function hasUnresolvedLateMaterialToResolve(parentMaterials = [], sectionWorkOrders = []) {
    return collectLateMaterialLines(parentMaterials, sectionWorkOrders)
        .some((m) => getRemainingToResolveQty(m) > 0);
}

/**
 * Phase 1 parent inventory sync consumes full BOM requiredQty on Completed.
 * Partial FG (e.g. 60 of 100) is therefore unsafe — block until fully resolved.
 */
export function buildLateMaterialFullResolveBlockMessage(lines = []) {
    const unresolved = (lines || []).filter((m) => getRemainingToResolveQty(m) > 0);
    const remaining = unresolved.reduce((sum, m) => sum + getRemainingToResolveQty(m), 0);
    const names = unresolved.map((m) => m.itemName).filter(Boolean).join(', ');
    const base = 'Cannot complete Finished Goods. Late material is not fully resolved. Parent inventory posting consumes the full BOM required quantity, so partial FG completion is not allowed until Remaining to Resolve is 0.';
    if (remaining > 0) {
        return names
            ? `${base} Remaining to Resolve: ${remaining} (${names}).`
            : `${base} Remaining to Resolve: ${remaining}.`;
    }
    return base;
}

export function getLateMaterialStatusLabel(m, supplementaryWos = []) {
    const req = Math.max(0, Number(m?.requiredQty) || 0);
    const remainingResolve = getRemainingToResolveQty(m);
    const resolved = getAddedLaterQty(m) + getSupplementaryCompletedQty(m);
    const allocated = getSupplementaryAllocatedQty(m);
    const completedSup = getSupplementaryCompletedQty(m);
    const related = (supplementaryWos || []).filter((w) => {
        if (w.status === 'Cancelled') return false;
        return (w.supplementaryMaterials || []).some((sm) =>
            String(sm.materialId) === String(m?._id)
            || (m?.itemId && String(sm.itemId) === String(m.itemId))
        );
    });
    if (shouldMarkFullyResolved(m)) return 'Fully Resolved';
    const anyInProgress = related.some((w) => ['In Process', 'WIP – Waiting Material'].includes(w.status));
    if (anyInProgress) {
        return resolved > 0
            ? `Partially Resolved — ${resolved}/${req} · Supplementary In Progress`
            : 'Supplementary In Progress';
    }
    if (related.length && allocated > completedSup) {
        return resolved > 0
            ? `Partially Resolved — ${resolved}/${req} · Supplementary WO Created`
            : 'Supplementary WO Created';
    }
    if (resolved > 0 && remainingResolve > 0) return `Partially Resolved — ${resolved}/${req}`;
    return 'Pending Material';
}

export function buildMaterialEventEntry({
    eventType,
    material,
    qty = 0,
    remainingPendingQty = 0,
    remainingToAllocateQty = remainingPendingQty,
    remainingToResolveQty = 0,
    userId = null,
    remarks = '',
    supplementaryWorkOrderId = null,
    supplementaryWoNumber = '',
}) {
    return {
        eventType,
        materialId: material?._id,
        itemId: material?.itemId,
        itemCode: material?.itemCode || '',
        itemName: material?.itemName || '',
        qty: Number(qty) || 0,
        remainingPendingQty: Number(remainingPendingQty) || 0,
        remainingToAllocateQty: Number(remainingToAllocateQty) || 0,
        remainingToResolveQty: Number(remainingToResolveQty) || 0,
        remarks: remarks || '',
        supplementaryWorkOrderId: supplementaryWorkOrderId || null,
        supplementaryWoNumber: supplementaryWoNumber || '',
        createdBy: userId || null,
        createdAt: new Date(),
    };
}

export function enrichMaterialLateFields(materials = [], supplementaryWos = []) {
    return (materials || []).map((m) => ({
        ...m,
        addedLaterQty: getAddedLaterQty(m),
        supplementaryAllocatedQty: getSupplementaryAllocatedQty(m),
        supplementaryCompletedQty: getSupplementaryCompletedQty(m),
        remainingToAllocateQty: getRemainingToAllocateQty(m),
        remainingToResolveQty: getRemainingToResolveQty(m),
        remainingPendingQty: getRemainingToAllocateQty(m),
        lateMaterialStatus: getLateMaterialStatusLabel(m, supplementaryWos),
    }));
}

/** Original BOM-required flag on a WO material line (legacy docs without the field are required). */
export function isBomRequiredMaterial(m) {
    return m?.bomIsMandatory !== false;
}

/** Owner temporarily unticked Mandatory on a BOM-required WO line. */
export function isDeferredMaterial(m) {
    return isBomRequiredMaterial(m) && m?.isMandatory === false;
}

/** BOM-required lines still short or still quantity-pending — used for FG completion, not Release. */
export function getUnresolvedRequiredMaterials(materialStatus = []) {
    return (materialStatus || []).filter((m) => {
        if (!isBomRequiredMaterial(m)) return false;
        if (isLateMaterialLine(m)) return getRemainingToResolveQty(m) > 0 || !shouldMarkFullyResolved(m);
        return Number(m.shortQty) > 0;
    });
}

export function buildUnresolvedRequiredBlockMessage(items = []) {
    const n = (items || []).length;
    const names = (items || []).map((m) => m.itemName).filter(Boolean).join(', ');
    const noun = n === 1 ? 'component is' : 'components are';
    const base = `Cannot complete Finished Goods. ${n} original BOM ${noun} still pending.`;
    return names ? `${base} ${names}.` : base;
}

export function buildPendingProceedWarning(count) {
    const n = Number(count) || 0;
    const noun = n === 1 ? 'component is' : 'components are';
    return `${n} ${noun} pending. Production may proceed temporarily.`;
}

/** Active working list vs deferred/pending — does not delete WO snapshot lines. */
export function splitActiveAndDeferredMaterials(materials = []) {
    const active = [];
    const deferred = [];
    for (const m of materials || []) {
        if (isDeferredMaterial(m)) deferred.push(m);
        else active.push(m);
    }
    return { active, deferred };
}

export function getMaterialDisplayStatus(m, currentMandatory = m?.isMandatory) {
    const deferred = isDeferredMaterial({ ...m, isMandatory: currentMandatory });
    if (deferred && Number(m?.shortQty) > 0) return 'Pending Material';
    if (deferred) return 'Deferred for Current Stage';
    if (Number(m?.shortQty) > 0) return 'Short';
    return 'Available';
}

function itemKey(itemId) {
    if (!itemId) return '';
    return String(itemId._id || itemId);
}

/** Attach BOM section snapshot onto WO material lines (display / filter). Does not write BOM Master. */
export function attachSectionToMaterialLines(materials = [], bomComponents = []) {
    const byItem = new Map();
    for (const c of bomComponents || []) {
        const id = itemKey(c.itemId);
        if (!id) continue;
        if (!byItem.has(id)) byItem.set(id, []);
        byItem.get(id).push(c);
    }
    return (materials || []).map((m) => {
        const existingNo = Number(m.sectionNo);
        if (Number.isFinite(existingNo) && existingNo >= 1) {
            return {
                ...m,
                sectionNo: existingNo,
                sectionName: m.sectionName || '',
            };
        }
        const list = byItem.get(itemKey(m.itemId)) || [];
        const bom = list.length === 1 ? list[0] : null;
        if (!bom) return m;
        return {
            ...m,
            sectionNo: Number(bom.sectionNo) || 1,
            sectionName: bom.sectionName || '',
        };
    });
}

/** Section WO display: keep only components mapped to this BOM sectionNo. Never by item-name alone. */
export function filterSectionWorkOrderMaterials(materials = [], sectionNo, bomComponents = []) {
    const no = Number(sectionNo);
    if (!Number.isFinite(no) || no < 1) return materials || [];
    const enriched = attachSectionToMaterialLines(materials, bomComponents);
    return enriched.filter((m) => {
        if (m.sectionNo != null && Number(m.sectionNo) >= 1) {
            return Number(m.sectionNo) === no;
        }
        return true;
    });
}

export function collectPendingFgMaterials(parentMaterialStatus = [], sectionWorkOrders = []) {
    const seen = new Set();
    const out = [];
    const add = (m) => {
        const key = itemKey(m.itemId) || m.itemName;
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(m);
    };
    getUnresolvedRequiredMaterials(parentMaterialStatus).forEach(add);
    for (const child of sectionWorkOrders || []) {
        getUnresolvedRequiredMaterials(child.materialStatus).forEach(add);
    }
    return out;
}

export function buildMandatoryChangeEntry({ material, previousMandatory, newMandatory, userId, remarks }) {
    return {
        materialId: material?._id,
        itemId: material?.itemId,
        itemName: material?.itemName || '',
        previousMandatory: !!previousMandatory,
        newMandatory: !!newMandatory,
        remarks: remarks || '',
        changedBy: userId || null,
        changedAt: new Date(),
    };
}

const ACTIVE_SECTION_STATUSES = new Set([
    'Released',
    'In Process',
    'WIP – Waiting Material',
    'On Hold',
    'Completed',
    'Closed',
]);

/** True when a Section WO has any production / audit activity that must be preserved. */
export function hasSectionProductionActivity(wo, { supplementaryCount = 0 } = {}) {
    if (!wo) return false;
    if (wo.inventorySynced) return true;
    if (Number(supplementaryCount) > 0) return true;
    if (ACTIVE_SECTION_STATUSES.has(wo.status)) return true;
    const stages = Array.isArray(wo.stages) ? wo.stages : [];
    if (stages.some((s) => s?.status && s.status !== 'Not Started')) return true;
    if (stages.some((s) => (s.productionLogs || []).length > 0)) return true;
    if (stages.some((s) => (Number(s.outputQty) || 0) > 0)) return true;
    const materials = Array.isArray(wo.materialStatus) ? wo.materialStatus : [];
    if (materials.some((m) =>
        (Number(m.addedLaterQty) || 0) > 0
        || (Number(m.supplementaryAllocatedQty) || 0) > 0
        || (Number(m.supplementaryCompletedQty) || 0) > 0
    )) return true;
    if ((wo.materialEventHistory || []).length > 0) return true;
    if ((wo.mandatoryChangeHistory || []).length > 0) return true;
    return false;
}

/** Draft / leftover Cancelled Section WO with no production activity may be hard-deleted so S{n} can be reused. */
export function canHardDeleteSectionWorkOrder(wo, extras = {}) {
    if (!isSectionWorkOrder(wo)) return false;
    if (wo.inventorySynced) return false;
    if (!['Draft', 'Cancelled'].includes(wo.status)) return false;
    return !hasSectionProductionActivity(wo, extras);
}

export function buildDeletedSectionExistsMessage(sectionName) {
    const name = String(sectionName || 'this section').trim() || 'this section';
    return `A deleted Section Work Order already exists for ${name}.`;
}

export function classifyParentDeleteSectionChildren(children = [], extrasById = {}) {
    const cascade = [];
    const blocking = [];
    for (const child of children) {
        const extras = extrasById[String(child?._id || '')] || {};
        if (canHardDeleteSectionWorkOrder(child, extras)) cascade.push(child);
        else blocking.push(child);
    }
    return { cascade, blocking };
}

export function buildParentDeleteBlockedMessage(child) {
    const number = child?.woNumber || 'unknown';
    return `Cannot delete parent while Section WO ${number} has production history. Restore or keep that Section WO.`;
}
