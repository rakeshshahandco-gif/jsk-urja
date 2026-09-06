/**
 * Stage-wise, quantity-wise BOM consumption (PCB / SMD / TH only).
 * Posts WO_CONSUMPTION deltas to existing StockLedger. No new collection.
 */
import mongoose from 'mongoose';
import { StockLedger } from '../models/stockLedger.model.js';
import { Item } from '../models/item.model.js';
import { BOM } from '../models/bom.model.js';
import { WorkOrder } from '../models/workOrder.model.js';
import { ApiError } from '../utils/ApiError.js';
import { recalculateStockLedger } from '../utils/stockUtils.js';
import {
    isSupplementaryWorkOrder,
    isSectionWorkOrder,
} from './workOrderSection.service.js';
import {
    getAlreadyConsumedOutQtyByItem,
    resolveStockReferenceIds,
} from './workOrderMaterialIssue.service.js';

export const STAGE_CONSUMPTION_VOUCHER = 'Stage Consumption';
export const STAGE_CONSUMPTION_PROCESS_TYPES = ['PCB', 'SMD', 'TH'];
const QTY_EPS = 1e-6;

export function normalizeComponentProcessType(raw) {
    const v = String(raw || '').trim().toUpperCase();
    if (v === 'PCB' || v === 'SMD' || v === 'TH' || v === 'OTHER') return v;
    return '';
}

export function resolveMaterialProcessType(material, bomComponents = []) {
    const bom = (bomComponents || []).find((c) =>
        (material?.itemId && c?.itemId && String(c.itemId) === String(material.itemId))
        || (material?.itemCode && c?.itemCode && String(c.itemCode) === String(material.itemCode))
    );
    const fromBom = normalizeComponentProcessType(bom?.componentType);
    if (fromBom) return fromBom;
    const fromLine = normalizeComponentProcessType(material?.itemType);
    if (fromLine && fromLine !== 'OTHER') return fromLine;
    return 'UNCLASSIFIED';
}

export function processTypeForStage(stage) {
    const seq = Number(stage?.seq);
    if (seq === 1) return 'PCB';
    if (seq === 2) return 'SMD';
    if (seq === 3) return 'TH';
    const name = String(stage?.stageName || '').trim().toUpperCase();
    if (name === 'PCB') return 'PCB';
    if (name.includes('SMD')) return 'SMD';
    if (name.includes('TH MOUNT') || name === 'TH') return 'TH';
    return '';
}

export function isDeferredForStageConsume(m) {
    return m?.bomIsMandatory !== false && m?.isMandatory === false;
}

/** Cumulative qty that should have been consumed for completed output. Uses WO requiredQty / targetQty. */
export function desiredCumulativeConsumeQty(material, completedQty, targetQty) {
    const req = Math.max(0, Number(material?.requiredQty) || 0);
    const target = Math.max(0, Number(targetQty) || 0);
    const done = Math.max(0, Number(completedQty) || 0);
    if (req <= 0 || target <= 0 || done <= 0) return 0;
    const capped = Math.min(done, target);
    return req * capped / target;
}

export function consumeDeltaQty(desired, already) {
    const d = Math.max(0, Number(desired) || 0);
    const a = Math.max(0, Number(already) || 0);
    const delta = d - a;
    if (delta <= QTY_EPS) return 0;
    return delta;
}

export function buildStageConsumePlan({
    materials = [],
    bomComponents = [],
    processType,
    completedQty,
    targetQty,
    alreadyByItem = {},
} = {}) {
    const type = String(processType || '').toUpperCase();
    if (!STAGE_CONSUMPTION_PROCESS_TYPES.includes(type)) return [];
    const pool = { ...alreadyByItem };
    const plan = [];
    for (const mat of materials || []) {
        if (!mat?.itemId) continue;
        const resolved = resolveMaterialProcessType(mat, bomComponents);
        if (resolved !== type) continue;
        const id = String(mat.itemId);
        const already = Math.max(0, Number(pool[id]) || 0);
        const desired = desiredCumulativeConsumeQty(mat, completedQty, targetQty);
        if (isDeferredForStageConsume(mat)) {
            plan.push({
                material: mat,
                itemId: id,
                processType: type,
                desiredQty: desired,
                alreadyQty: already,
                consumeQty: 0,
                skipped: 'deferred',
            });
            continue;
        }
        const consumeQty = consumeDeltaQty(desired, already);
        if (id) pool[id] = already + consumeQty;
        plan.push({
            material: mat,
            itemId: id,
            processType: type,
            desiredQty: desired,
            alreadyQty: already,
            consumeQty,
            skipped: '',
        });
    }
    return plan;
}

export function buildInsufficientStockMessage(stageName, completedIncrease, line, available) {
    const name = line?.material?.itemName || line?.material?.itemCode || 'Component';
    const need = line?.consumeQty;
    return `Cannot complete additional ${completedIncrease} pcs at ${stageName}. ${name} requires ${need} pcs; only ${available} available.`;
}

export function assertCompletedNotBelowConsumed({
    materials = [],
    bomComponents = [],
    processType,
    newCompletedQty,
    targetQty,
    alreadyByItem = {},
    stageName = 'this stage',
} = {}) {
    const type = String(processType || '').toUpperCase();
    if (!STAGE_CONSUMPTION_PROCESS_TYPES.includes(type)) return;
    for (const mat of materials || []) {
        if (!mat?.itemId) continue;
        if (resolveMaterialProcessType(mat, bomComponents) !== type) continue;
        const desired = desiredCumulativeConsumeQty(mat, newCompletedQty, targetQty);
        const already = Math.max(0, Number(alreadyByItem[String(mat.itemId)]) || 0);
        if (already > desired + QTY_EPS) {
            throw new ApiError(
                400,
                `Cannot reduce ${stageName} completed quantity below already-consumed production quantity. Reverse production/material consumption first.`
            );
        }
    }
}

export function shouldApplyStageMaterialConsumption(wo, stage) {
    if (!wo || !stage) return false;
    if (isSupplementaryWorkOrder(wo)) return false;
    if (wo.productionModule === 'textile') return false;
    if (stage.notApplicable === true || stage.isApplicable === false) return false;
    return STAGE_CONSUMPTION_PROCESS_TYPES.includes(processTypeForStage(stage));
}

export async function assertStageReduceAllowed(wo, stage, newCompletedQty, session = null) {
    if (!shouldApplyStageMaterialConsumption(wo, stage)) return;
    const refs = resolveStockReferenceIds(wo);
    const alreadyByItem = await getAlreadyConsumedOutQtyByItem(refs.stockReferenceId, session);
    const bomComponents = await loadBomComponents(wo, session);
    assertCompletedNotBelowConsumed({
        materials: wo.materialStatus,
        bomComponents,
        processType: processTypeForStage(stage),
        newCompletedQty,
        targetQty: wo.targetQty,
        alreadyByItem,
        stageName: stage.stageName,
    });
}

async function loadBomComponents(wo, session) {
    const bomId = wo?.bomId?._id || wo?.bomId;
    if (!bomId) return [];
    const q = BOM.findById(bomId).select('components.itemId components.itemCode components.componentType').lean();
    if (session) q.session(session);
    const bom = await q;
    return bom?.components || [];
}

export async function applyStageWiseMaterialConsumption({
    wo,
    stage,
    completedQty,
    prevCompletedQty = 0,
    userId,
    session,
} = {}) {
    if (!shouldApplyStageMaterialConsumption(wo, stage)) return { posted: 0, plan: [] };
    if (!isSectionWorkOrder(wo)) {
        const parentId = wo._id;
        const existsQ = WorkOrder.exists({ parentWorkOrderId: parentId, woKind: 'section' });
        if (session) existsQ.session(session);
        if (await existsQ) return { posted: 0, plan: [], skipped: 'parent-has-sections' };
    }

    const processType = processTypeForStage(stage);
    const refs = resolveStockReferenceIds(wo);
    const alreadyByItem = await getAlreadyConsumedOutQtyByItem(refs.stockReferenceId, session);
    const bomComponents = await loadBomComponents(wo, session);
    const newCompleted = Math.max(0, Number(completedQty) || 0);
    const prevCompleted = Math.max(0, Number(prevCompletedQty) || 0);

    if (newCompleted < prevCompleted) {
        assertCompletedNotBelowConsumed({
            materials: wo.materialStatus,
            bomComponents,
            processType,
            newCompletedQty: newCompleted,
            targetQty: wo.targetQty,
            alreadyByItem,
            stageName: stage.stageName,
        });
        return { posted: 0, plan: [], skipped: 'reduced-no-reversal' };
    }

    const plan = buildStageConsumePlan({
        materials: wo.materialStatus,
        bomComponents,
        processType,
        completedQty: newCompleted,
        targetQty: wo.targetQty,
        alreadyByItem,
    });

    const toPost = plan.filter((p) => p.consumeQty > 0);
    if (toPost.length) {
        const increase = Math.max(0, newCompleted - prevCompleted) || newCompleted;
        const itemIds = toPost.map((p) => p.itemId);
        const items = await Item.find({ _id: { $in: itemIds } }).session(session);
        const itemMap = Object.fromEntries(items.map((i) => [String(i._id), i]));
        for (const line of toPost) {
            const item = itemMap[line.itemId];
            if (!item) throw new ApiError(400, `${line.material.itemName || line.material.itemCode}: item master not found.`);
            const available = Math.max(0, Number(item.currentStock) || 0);
            if (line.consumeQty > available + QTY_EPS) {
                throw new ApiError(400, buildInsufficientStockMessage(stage.stageName, increase, line, available));
            }
        }

        const entries = [];
        for (const line of toPost) {
            const item = itemMap[line.itemId];
            const qty = line.consumeQty;
            const rate = Number(item.valuationRate) || 0;
            entries.push({
                date: new Date(),
                itemId: item._id,
                itemCode: line.material.itemCode || item.itemCode || '',
                itemName: line.material.itemName || item.itemName || item.name || '',
                itemGroup: item.itemCategory || '',
                itemType: item.itemType || '',
                uom: line.material.uom || item.uom || '',
                transactionType: 'WO_CONSUMPTION',
                voucherType: STAGE_CONSUMPTION_VOUCHER,
                referenceNo: wo.woNumber,
                referenceId: refs.stockReferenceId,
                inQty: 0,
                outQty: qty,
                rate,
                amount: Math.round(qty * rate * 100) / 100,
                remarks: `${wo.woNumber} / ${processType} / Stage Consumption · completed ${newCompleted}`,
                financialYear: wo.financialYear,
                createdBy: userId,
            });
            item.currentStock = (Number(item.currentStock) || 0) - qty;
            await item.save({ session });
        }
        await StockLedger.insertMany(entries, { session });
        for (const itemId of [...new Set(toPost.map((p) => lineItemId(p)))]) {
            await recalculateStockLedger(itemId, session);
        }
    }

    const consumedAny = plan.some((p) => !p.skipped && (p.consumeQty > 0 || p.alreadyQty > 0));
    if (consumedAny || toPost.length) {
        stage.materialConsumedForQty = newCompleted;
        stage.lastMaterialConsumptionAt = new Date();
    }
    return { posted: toPost.length, plan };
}

function lineItemId(p) {
    return p.itemId;
}

export async function listStageMaterialConsumption(wo, session = null) {
    const refs = resolveStockReferenceIds(wo);
    if (!refs.stockReferenceId) return [];
    const q = StockLedger.find({
        referenceId: new mongoose.Types.ObjectId(String(refs.stockReferenceId)),
        transactionType: 'WO_CONSUMPTION',
        isDeleted: { $ne: true },
    }).sort({ date: -1, createdAt: -1 }).lean();
    if (session) q.session(session);
    return q;
}
