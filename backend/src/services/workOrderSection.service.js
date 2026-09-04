/**
 * Phase 1 BOM Section / Subassembly Work Orders — pure helpers.
 * Section WOs are process-tracking only: they must never drive stock, reservation, or FG posting.
 */

export const MAIN_WO_KIND = 'main';
export const SECTION_WO_KIND = 'section';

export const EXCLUDE_SECTION_WO = { woKind: { $ne: SECTION_WO_KIND } };

export function isSectionWorkOrder(wo) {
    return wo?.woKind === SECTION_WO_KIND;
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

export function getAuthoritativeCompletedQty(wo) {
    if (!wo || wo.status === 'Cancelled') return 0;
    const stages = Array.isArray(wo.stages) ? wo.stages : [];
    if (!stages.length) return 0;

    const finalQc = stages.find((s) => Number(s.seq) === 9)
        || (() => {
            const qc = stages.filter((s) => s.isQcGate);
            if (!qc.length) return null;
            return qc.reduce((a, b) => (Number(b.seq) > Number(a.seq) ? b : a));
        })();
    const last = stages.reduce((a, b) => (Number(b.seq) > Number(a.seq) ? b : a), stages[0]);
    const stage = finalQc || last;
    const qty = Number(stage?.outputQty) || 0;
    return qty > 0 ? qty : 0;
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
    if (isSectionWorkOrder(wo)) return false;
    return wo.status === 'Completed' && !wo.inventorySynced;
}

/** Original BOM-required flag on a WO material line (legacy docs without the field are required). */
export function isBomRequiredMaterial(m) {
    return m?.bomIsMandatory !== false;
}

/** Owner temporarily unticked Mandatory on a BOM-required WO line. */
export function isDeferredMaterial(m) {
    return isBomRequiredMaterial(m) && m?.isMandatory === false;
}

/** BOM-required lines still short or still deferred — used for FG completion, not Release. */
export function getUnresolvedRequiredMaterials(materialStatus = []) {
    return (materialStatus || []).filter((m) =>
        isBomRequiredMaterial(m) && (Number(m.shortQty) > 0 || isDeferredMaterial(m))
    );
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
