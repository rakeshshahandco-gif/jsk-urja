/**
 * Late Material Issue — real stock consumption using existing StockLedger / Item.currentStock.
 * Parent completion later consumes only remaining unissued qty (same WO_CONSUMPTION + parent referenceId).
 */
import mongoose from 'mongoose';
import { StockLedger } from '../models/stockLedger.model.js';
import { Item } from '../models/item.model.js';
import { recalculateStockLedger } from '../utils/stockUtils.js';
import { ApiError } from '../utils/ApiError.js';
import {
    lateMaterialItemLabel,
    getRemainingToResolveQty,
    applyAddedLaterQty,
    getRemainingPendingQty,
    buildMaterialEventEntry,
    isSupplementaryWorkOrder,
} from './workOrderSection.service.js';
import { WorkOrder } from '../models/workOrder.model.js';

export const LATE_MATERIAL_ISSUE_VOUCHER = 'Late Material Issue';

export function buildMaterialIssueNo(woNumber, index) {
    const n = Math.max(1, Number(index) || 1);
    return `MI-${String(woNumber || 'WO')}-${String(n).padStart(3, '0')}`;
}

/** Posted Late Material Issue qty keyed by materialId / itemId. */
export function postedIssueQtyByMaterial(batches = []) {
    const byMaterial = {};
    const byItem = {};
    for (const batch of batches || []) {
        if (batch?.status && batch.status !== 'Posted') continue;
        for (const line of batch.lines || []) {
            const q = Math.max(0, Number(line.qtyIssued) || 0);
            if (!q) continue;
            if (line.materialId) {
                const k = String(line.materialId);
                byMaterial[k] = (byMaterial[k] || 0) + q;
            }
            if (line.itemId) {
                const k = String(line.itemId);
                byItem[k] = (byItem[k] || 0) + q;
            }
        }
    }
    return { byMaterial, byItem };
}

export function getPostedIssueQtyForMaterial(material, posted = { byMaterial: {}, byItem: {} }) {
    const mid = material?._id ? posted.byMaterial?.[String(material._id)] : 0;
    if (mid) return mid;
    const iid = material?.itemId ? posted.byItem?.[String(material.itemId)] : 0;
    return iid || 0;
}

/** Physical inventory still unissued. Allocation to a SUP does not reduce this. */
export function getRemainingToIssueQty(material, postedIssueQty = 0) {
    const req = Math.max(0, Number(material?.requiredQty) || 0);
    return Math.max(0, req - Math.max(0, Number(postedIssueQty) || 0));
}

/** Issue-loop rows store the subdoc as `material`, not `mat`. */
export function resolveIssueLineMaterial(line) {
    return line?.material || line?.mat || null;
}

export function resolveSectionMaterialLine(materialStatus, materialId, hint = {}) {
    if (!materialStatus) return null;
    if (materialId && typeof materialStatus.id === 'function') {
        const bySubId = materialStatus.id(materialId);
        if (bySubId) return bySubId;
    }
    const list = Array.isArray(materialStatus) ? materialStatus : [];
    const exact = list.filter((m) => materialId && String(m._id) === String(materialId));
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return null;
    const itemId = hint.itemId;
    const byItem = list.filter((m) => itemId && m.itemId && String(m.itemId) === String(itemId));
    if (byItem.length === 1) return byItem[0];
    if (byItem.length > 1) return null;
    const itemCode = hint.itemCode;
    const byCode = list.filter((m) => itemCode && m.itemCode && m.itemCode === itemCode);
    if (byCode.length === 1) return byCode[0];
    return null;
}

export function existingSupForMaterial(sups = [], material) {
    for (const s of sups || []) {
        if (s?.status === 'Cancelled') continue;
        const hit = (s.supplementaryMaterials || []).some((sm) =>
            (material?._id && String(sm.materialId) === String(material._id))
            || (material?.itemId && sm.itemId && String(sm.itemId) === String(material.itemId))
            || (material?.itemCode && sm.itemCode && sm.itemCode === material.itemCode)
        );
        if (hit) return s._id ? { _id: s._id, woNumber: s.woNumber, startFromSeq: s.startFromSeq, status: s.status } : null;
    }
    return null;
}

/** Safe to add another late component without rewriting SUP production history. */
export function canAppendLateMaterialToSupplementary(sup, { sectionId } = {}) {
    if (!sup || ['Cancelled', 'Completed', 'Closed'].includes(String(sup.status || ''))) return false;
    const sourceId = sup.sourceSectionWorkOrderId?._id || sup.sourceSectionWorkOrderId;
    if (sectionId && sourceId && String(sourceId) !== String(sectionId)) return false;
    if (!['Draft', 'Released', 'Pending'].includes(String(sup.status || ''))) return false;
    for (const stage of sup.stages || []) {
        if (stage?.notApplicable || stage?.isApplicable === false) continue;
        if (stage?.status && stage.status !== 'Not Started') return false;
        if ((stage?.productionLogs || []).length > 0) return false;
        if ((Number(stage?.outputQty) || 0) > 0) return false;
        if ((Number(stage?.inputQty) || 0) > 0) return false;
    }
    return true;
}

export function groupSelectedMaterialsBySupplementary(materials = [], sups = []) {
    const assigned = [];
    const byId = new Map();
    const unassigned = [];
    for (const mat of materials || []) {
        const dest = existingSupForMaterial(sups, mat);
        if (!dest) {
            unassigned.push(mat);
            continue;
        }
        const key = String(dest._id);
        if (!byId.has(key)) {
            const group = { dest, materials: [] };
            byId.set(key, group);
            assigned.push(group);
        }
        byId.get(key).materials.push(mat);
    }
    return { assigned, unassigned };
}

/** Join the one existing dest in this selection if it can still accept lines. Do not guess among many. */
export function resolveUnassignedSupplementaryPlan(unassigned = [], selectionSups = [], opts = {}) {
    if (!unassigned.length) return { action: 'none' };
    const unique = [];
    const seen = new Set();
    for (const s of selectionSups || []) {
        const id = String(s?._id || s?.dest?._id || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        unique.push(s.dest || s);
    }
    if (unique.length !== 1) return { action: 'create' };
    if (canAppendLateMaterialToSupplementary(unique[0], opts)) {
        return { action: 'join', sup: unique[0] };
    }
    return { action: 'create' };
}

export function defaultIssueQty(material, availableStock, postedIssueQty = 0) {
    const remaining = getRemainingToIssueQty(material, postedIssueQty);
    const stock = Math.max(0, Number(availableStock) || 0);
    return Math.max(0, Math.min(remaining, stock));
}

export function validateLateMaterialIssueQty(material, qty, availableStock, postedIssueQty = 0) {
    const label = lateMaterialItemLabel(material);
    const n = Number(qty);
    const remaining = getRemainingToIssueQty(material, postedIssueQty);
    const stock = Math.max(0, Number(availableStock) || 0);
    if (!Number.isFinite(n) || !(n > 0)) {
        return `${label} cannot be issued: Qty must be greater than 0. No material was issued.`;
    }
    if (n > remaining) {
        return `${label} cannot be issued: Qty ${n} exceeds remaining to issue ${remaining}. No material was issued.`;
    }
    if (n > stock) {
        return `${label} cannot be issued: requested ${n}, available stock is ${stock}. No material was issued.`;
    }
    return null;
}

export function validateLateMaterialIssueBatch(lines = []) {
    const seen = new Set();
    if (!Array.isArray(lines) || !lines.length) {
        return 'Select at least one pending component. No material was issued.';
    }
    for (const line of lines) {
        const id = String(line?.materialId || line?.material?._id || '');
        if (!id) return 'Each selected component must have a material id. No material was issued.';
        if (seen.has(id)) return `${lateMaterialItemLabel(line.material || line)} cannot be issued twice in the same batch. No material was issued.`;
        seen.add(id);
        const err = validateLateMaterialIssueQty(line.material || line, line.qty, line.availableStock, line.postedIssueQty);
        if (err) return err;
    }
    return null;
}

/** Already posted WO_CONSUMPTION outQty against a parent/reference WO, by itemId. */
export async function getAlreadyConsumedOutQtyByItem(referenceId, session = null) {
    if (!referenceId) return {};
    const q = StockLedger.aggregate([
        {
            $match: {
                referenceId: new mongoose.Types.ObjectId(String(referenceId)),
                transactionType: 'WO_CONSUMPTION',
                isDeleted: { $ne: true },
            },
        },
        { $group: { _id: '$itemId', qty: { $sum: { $ifNull: ['$outQty', 0] } } } },
    ]);
    if (session) q.session(session);
    const rows = await q;
    const map = {};
    for (const row of rows) {
        if (row?._id) map[String(row._id)] = Math.max(0, Number(row.qty) || 0);
    }
    return map;
}

/**
 * Allocate already-consumed qty across parent material lines (same itemId may appear more than once).
 * Returns consumeQty that parent sync may still post.
 */
export function allocateRemainingParentConsume(materialStatus = [], alreadyByItemId = {}) {
    const pool = { ...alreadyByItemId };
    return (materialStatus || []).map((mat) => {
        const req = Math.max(0, Number(mat?.requiredQty) || 0);
        const id = mat?.itemId ? String(mat.itemId) : '';
        const already = id ? Math.min(req, Math.max(0, Number(pool[id]) || 0)) : 0;
        if (id) pool[id] = Math.max(0, (Number(pool[id]) || 0) - already);
        return {
            itemId: id,
            requiredQty: req,
            alreadyQty: already,
            consumeQty: Math.max(0, req - already),
        };
    });
}

export function resolveStockReferenceIds(wo) {
    if (isSupplementaryWorkOrder(wo)) {
        return {
            parentWorkOrderId: wo.parentWorkOrderId || null,
            sectionWorkOrderId: wo.sourceSectionWorkOrderId || null,
            supplementaryWorkOrderId: wo._id,
            stockReferenceId: wo.parentWorkOrderId || wo.sourceSectionWorkOrderId || wo._id,
        };
    }
    if (wo?.woKind === 'section') {
        return {
            parentWorkOrderId: wo.parentWorkOrderId || null,
            sectionWorkOrderId: wo._id,
            supplementaryWorkOrderId: null,
            stockReferenceId: wo.parentWorkOrderId || wo._id,
        };
    }
    return {
        parentWorkOrderId: wo._id,
        sectionWorkOrderId: null,
        supplementaryWorkOrderId: null,
        stockReferenceId: wo._id,
    };
}

export function listPostedMaterialIssueHistory(wo) {
    return (wo?.materialIssueHistory || []).filter((b) => !b.status || b.status === 'Posted');
}

export function findIssueOnWorkOrder(wo, { idempotencyKey, issueNo, batchId } = {}) {
    const rows = wo?.materialIssueHistory || [];
    if (batchId && typeof rows.id === 'function') {
        const byId = rows.id(batchId);
        if (byId) return byId;
    }
    if (batchId) {
        return rows.find((b) => String(b._id) === String(batchId)) || null;
    }
    if (idempotencyKey) {
        return rows.find((b) => b.idempotencyKey === idempotencyKey && (!b.status || b.status === 'Posted')) || null;
    }
    if (issueNo) {
        return rows.find((b) => b.issueNo === issueNo) || null;
    }
    return null;
}

export function nextIssueIndexFromHistory(wo) {
    return (wo?.materialIssueHistory || []).length + 1;
}

export function serializeMaterialIssueBatch(batch) {
    if (!batch) return null;
    const row = typeof batch.toObject === 'function' ? batch.toObject() : { ...batch };
    if (Array.isArray(row.destinations)) {
        row.destinations = row.destinations.map((d) => ({
            _id: d.workOrderId || d._id,
            woNumber: d.woNumber || '',
            created: !!d.created,
            joined: !!d.joined,
            materialCount: Number(d.materialCount) || 0,
        }));
    }
    return row;
}

export async function loadLateMaterialIssueBatchesForWorkOrder(wo) {
    const newest = (a, b) => new Date(b.createdAt || b.issueDate || 0) - new Date(a.createdAt || a.issueDate || 0);
    if (wo?.woKind === 'supplementary' && wo.sourceSectionWorkOrderId) {
        const sectionId = wo.sourceSectionWorkOrderId._id || wo.sourceSectionWorkOrderId;
        const section = await WorkOrder.findById(sectionId).select('materialIssueHistory').lean();
        return listPostedMaterialIssueHistory(section)
            .filter((b) => String(b.supplementaryWorkOrderId) === String(wo._id))
            .sort(newest)
            .slice(0, 50);
    }
    if (wo?.woKind === 'section' || wo?.woKind === 'supplementary') {
        return listPostedMaterialIssueHistory(wo).slice().sort(newest).slice(0, 50);
    }
    const children = await WorkOrder.find({ parentWorkOrderId: wo._id, woKind: 'section' })
        .select('materialIssueHistory')
        .lean();
    return children.flatMap((c) => listPostedMaterialIssueHistory(c)).sort(newest).slice(0, 50);
}

export function findIssueByIdempotencyKey(wo, key) {
    if (!key) return null;
    return findIssueOnWorkOrder(wo, { idempotencyKey: key });
}

/**
 * All-or-nothing late material issue. Mutates wo material lines + history. Posts StockLedger.
 * Caller owns the Mongo session/transaction.
 */
export async function issueLateMaterialBatch({
    wo,
    items = [],
    remarks = '',
    idempotencyKey = '',
    userId,
    companyId = null,
    session,
} = {}) {
    if (!session) throw new ApiError(500, 'Late material issue requires a Mongo session');

    if (idempotencyKey) {
        const existing = findIssueByIdempotencyKey(wo, idempotencyKey);
        if (existing) return { batch: existing, reused: true, wo };
    }

    const refs = resolveStockReferenceIds(wo);
    const postedMap = postedIssueQtyByMaterial(listPostedMaterialIssueHistory(wo));
    const existingSups = refs.sectionWorkOrderId
        ? await WorkOrder.find({
            sourceSectionWorkOrderId: refs.sectionWorkOrderId,
            woKind: 'supplementary',
            status: { $nin: ['Cancelled'] },
        }).select('woNumber status supplementaryMaterials').session(session).lean()
        : [];

    const itemIds = [];
    const prepared = [];
    const destLinks = [];
    for (const row of items) {
        const mat = resolveSectionMaterialLine(wo.materialStatus, row.materialId, row);
        if (!mat) {
            const label = row.itemCode || row.materialId || 'component';
            throw new ApiError(400, `Material line ${label} could not be linked to the source Work Order. No material was issued.`);
        }
        if (mat.itemId) itemIds.push(mat.itemId);
        destLinks.push(existingSupForMaterial(existingSups, mat));
        prepared.push({
            mat,
            qty: Number(row.qty),
            remarks: row.remarks || remarks || '',
            materialId: String(mat._id),
            postedIssueQty: getPostedIssueQtyForMaterial(mat, postedMap),
        });
    }
    const linkedIds = [...new Set(destLinks.filter(Boolean).map((l) => String(l._id)))];
    const linkedSup = linkedIds.length === 1 && destLinks.every(Boolean) ? destLinks.find(Boolean) : null;

    const stockDocs = itemIds.length
        ? await Item.find({ _id: { $in: itemIds } }).select('currentStock valuationRate itemCode itemName name itemCategory itemType uom').session(session)
        : [];
    const stockById = new Map(stockDocs.map((i) => [String(i._id), i]));

    const batchLines = prepared.map(({ mat, qty, materialId, postedIssueQty }) => {
        const item = mat.itemId ? stockById.get(String(mat.itemId)) : null;
        const availableStock = item ? Number(item.currentStock) || 0 : Number(mat.availableStock) || 0;
        if (item) {
            mat.availableStock = availableStock;
            mat.shortQty = Math.max(0, (Number(mat.requiredQty) || 0) - availableStock);
        }
        return { materialId, material: mat, qty, availableStock, item, postedIssueQty };
    });
    const batchError = validateLateMaterialIssueBatch(batchLines);
    if (batchError) throw new ApiError(400, batchError);

    const issueIndex = nextIssueIndexFromHistory(wo);
    const issueNo = buildMaterialIssueNo(wo.woNumber, issueIndex);
    if (findIssueOnWorkOrder(wo, { issueNo })) {
        throw new ApiError(400, `Material Issue ${issueNo} already exists`);
    }

    if (!Array.isArray(wo.materialEventHistory)) wo.materialEventHistory = [];
    const ledgerEntries = [];
    const savedLines = [];

    for (const line of batchLines) {
        const mat = resolveIssueLineMaterial(line);
        const qty = Number(line.qty);
        const item = line.item;
        if (!mat) {
            throw new ApiError(400, `Material line ${line.materialId || 'unknown'} could not be linked to the source Work Order. No material was issued.`);
        }
        const rate = Number(item?.valuationRate) || 0;
        const { previousAddedLaterQty, newAddedLaterQty } = applyAddedLaterQty(mat, qty);
        // Issued qty is now on the product. Keep the line out of Pending even if SUP process is still open.
        if (getRemainingToResolveQty(mat) === 0) mat.isMandatory = true;
        const remainingAfter = getRemainingToResolveQty(mat);
        wo.materialEventHistory.push(buildMaterialEventEntry({
            eventType: 'late_material_issued',
            material: mat,
            qty,
            remainingPendingQty: getRemainingPendingQty(mat),
            remainingToAllocateQty: getRemainingPendingQty(mat),
            remainingToResolveQty: remainingAfter,
            userId,
            remarks: line.remarks || `Issued ${qty} on ${issueNo}`,
            previousAddedLaterQty,
            newAddedLaterQty,
        }));

        if (item) {
            ledgerEntries.push({
                date: new Date(),
                itemId: item._id,
                itemCode: mat.itemCode || item.itemCode || '',
                itemName: mat.itemName || item.itemName || item.name || '',
                itemGroup: item.itemCategory || '',
                itemType: item.itemType || '',
                uom: mat.uom || item.uom || '',
                transactionType: 'WO_CONSUMPTION',
                voucherType: LATE_MATERIAL_ISSUE_VOUCHER,
                referenceNo: issueNo,
                referenceId: refs.stockReferenceId,
                inQty: 0,
                outQty: qty,
                rate,
                amount: Math.round(qty * rate * 100) / 100,
                remarks: `Late Material Issue ${issueNo} · WO ${wo.woNumber} · material ${mat._id}`,
                financialYear: wo.financialYear,
                createdBy: userId,
            });
            item.currentStock = (Number(item.currentStock) || 0) - qty;
            await item.save({ session });
        }

        const dest = existingSupForMaterial(existingSups, mat);
        savedLines.push({
            materialId: mat._id,
            itemId: mat.itemId,
            itemCode: mat.itemCode || item?.itemCode || '',
            itemName: mat.itemName || item?.itemName || '',
            requiredQty: Number(mat.requiredQty) || 0,
            qtyIssued: qty,
            remainingAfter,
            rate,
            amount: Math.round(qty * rate * 100) / 100,
            remarks: line.remarks || '',
            supplementaryWorkOrderId: dest?._id || null,
            supplementaryWoNumber: dest?.woNumber || '',
        });
    }

    if (ledgerEntries.length) {
        await StockLedger.insertMany(ledgerEntries, { session });
        const uniqueItems = [...new Set(ledgerEntries.map((e) => String(e.itemId)))];
        for (const itemId of uniqueItems) {
            await recalculateStockLedger(itemId, session);
        }
    }

    const parentPop = wo.parentWorkOrderId && typeof wo.parentWorkOrderId === 'object'
        ? wo.parentWorkOrderId.woNumber
        : '';

    if (!Array.isArray(wo.materialIssueHistory)) wo.materialIssueHistory = [];
    wo.materialIssueHistory.push({
        issueNo,
        issueDate: new Date(),
        companyId: companyId || null,
        financialYear: wo.financialYear || '',
        parentWorkOrderId: refs.parentWorkOrderId,
        sectionWorkOrderId: refs.sectionWorkOrderId,
        supplementaryWorkOrderId: linkedSup?._id || refs.supplementaryWorkOrderId,
        supplementaryWoNumber: linkedSup?.woNumber || '',
        stockReferenceId: refs.stockReferenceId,
        parentWoNumber: parentPop || '',
        sectionWoNumber: wo.woKind === 'section' ? wo.woNumber : '',
        sectionName: wo.bomSectionName || '',
        supervisor: wo.supervisor || '',
        productName: wo.finishedProductName || '',
        idempotencyKey: idempotencyKey || '',
        status: 'Posted',
        lines: savedLines,
        remarks: remarks || '',
        createdBy: userId,
        createdAt: new Date(),
    });
    const batch = wo.materialIssueHistory[wo.materialIssueHistory.length - 1];

    return { batch, reused: false, wo };
}
