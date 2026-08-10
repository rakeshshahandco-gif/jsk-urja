import mongoose from 'mongoose';
import httpStatus from 'http-status';
import { SalesOrder } from '../models/salesOrder.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { ApiError } from './ApiError.js';

const ORDER_TERMINAL_STATUSES = new Set(['Cancelled', 'Closed', 'Completed']);

/** Draft-only — all other statuses are treated as submitted/finalized. */
export function isSalesOrderDraft(so) {
    return (so?.status || 'Draft') === 'Draft';
}

/**
 * Reject Sales Order field updates when submitted or linked to an active invoice.
 * Allows updates only while status is Draft (including Draft → Confirmed submit).
 */
export async function assertSalesOrderCanBeUpdated(so, session = null) {
    if (!so) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Sales Order not found');
    }
    if (so.status === 'Cancelled') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot update a cancelled SO');
    }

    if (so.invoiceId) {
        const inv = await SalesInvoice.findById(so.invoiceId)
            .session(session)
            .select('isDeleted status invoiceNumber')
            .lean();
        if (inv && inv.isDeleted !== true && inv.status !== 'Cancelled') {
            throw new ApiError(
                httpStatus.BAD_REQUEST,
                'Sales Order cannot be edited because invoice is already created. Delete the linked invoice first if correction is required.'
            );
        }
    }

    if (!isSalesOrderDraft(so)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Submitted Sales Order cannot be edited.');
    }
}

/** Accept soId / sold / salesOrderId from API body or query aliases. */
export function resolveSalesOrderId(source) {
    if (!source) return null;
    const raw = source.soId || source.sold || source.salesOrderId || source.orderId;
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;
    if (!mongoose.Types.ObjectId.isValid(trimmed)) return null;
    return trimmed;
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Product identity only — must NOT be used alone for remaining qty across duplicate SO lines. */
function productKey(item) {
    if (item?.itemId) return `id:${String(item.itemId)}`;
    return `name:${String(item.itemName || '').trim().toLowerCase()}`;
}

function resolveInvoiceSalesOrderLineId(invLine) {
    const raw = invLine?.salesOrderLineId || invLine?.soLineId || invLine?.lineId || null;
    if (!raw) return null;
    const s = String(raw).trim();
    return s && s !== 'null' && s !== 'undefined' ? s : null;
}

/**
 * Per SO-line invoiced qty from ACTIVE invoices only (not cancelled, not deleted).
 * Prefer salesOrderLineId; legacy lines without it are FIFO-allocated to matching product lines.
 */
function sumActiveInvoicedQtyBySoLine(soItems, activeInvoices) {
    const byLineId = new Map();
    for (const soItem of soItems || []) {
        if (soItem?._id) byLineId.set(String(soItem._id), 0);
    }

    const orphanByProduct = new Map();
    for (const inv of activeInvoices || []) {
        for (const line of inv.items || []) {
            const qty = Number(line.qty) || 0;
            if (qty <= 0) continue;
            const soLineId = resolveInvoiceSalesOrderLineId(line);
            if (soLineId && byLineId.has(soLineId)) {
                byLineId.set(soLineId, r2((byLineId.get(soLineId) || 0) + qty));
                continue;
            }
            const pk = productKey(line);
            orphanByProduct.set(pk, r2((orphanByProduct.get(pk) || 0) + qty));
        }
    }

    // FIFO: allocate orphan (legacy) invoiced qty onto SO lines with matching product, in order.
    for (const soItem of soItems || []) {
        const lineId = soItem?._id ? String(soItem._id) : null;
        if (!lineId) continue;
        const orderedQty = Number(soItem.qty) || 0;
        const already = byLineId.get(lineId) || 0;
        const room = Math.max(0, orderedQty - already);
        if (room <= 0.0001) continue;
        const pk = productKey(soItem);
        const orphan = orphanByProduct.get(pk) || 0;
        if (orphan <= 0.0001) continue;
        const take = Math.min(room, orphan);
        byLineId.set(lineId, r2(already + take));
        orphanByProduct.set(pk, r2(orphan - take));
    }

    return byLineId;
}

/**
 * Recalculate Sales Order billing link/status from active invoices only.
 * Never cancels or deletes the Sales Order.
 */
export async function recalculateSalesOrderBillingFromInvoices(soId, session = null) {
    if (!soId) return null;

    const so = await SalesOrder.findById(soId).session(session);
    if (!so) return null;

    if (ORDER_TERMINAL_STATUSES.has(so.status)) {
        return so;
    }

    const activeInvoices = await SalesInvoice.find({
        soId: so._id,
        isDeleted: { $ne: true },
        status: { $ne: 'Cancelled' },
    })
        .sort({ invoiceDate: 1, createdAt: 1 })
        .session(session);

    if (activeInvoices.length === 0) {
        if (so.status === 'Invoiced' || so.status === 'Partially Invoiced' || so.invoiceId) {
            so.status = so.status === 'Dispatched' ? 'Dispatched' : 'Confirmed';
            so.invoiceId = null;
            await so.save({ session });
        }
        return so;
    }

    const soItems = so.items || [];
    const invoicedByLineId = sumActiveInvoicedQtyBySoLine(soItems, activeInvoices);
    let anyInvoiced = false;
    let allFullyInvoiced = soItems.length > 0;

    for (const soItem of soItems) {
        const orderedQty = Number(soItem.qty) || 0;
        const invoicedQty = soItem._id ? (invoicedByLineId.get(String(soItem._id)) || 0) : 0;
        if (invoicedQty > 0.0001) anyInvoiced = true;
        if (invoicedQty < orderedQty - 0.0001) allFullyInvoiced = false;
    }

    const latestInv = activeInvoices[activeInvoices.length - 1];
    so.invoiceId = latestInv._id;

    if (!anyInvoiced) {
        so.status = so.status === 'Dispatched' ? 'Dispatched' : 'Confirmed';
        so.invoiceId = null;
    } else if (allFullyInvoiced) {
        so.status = 'Invoiced';
    } else {
        so.status = 'Partially Invoiced';
    }

    await so.save({ session });
    return so;
}

/**
 * Read-only billing snapshot for UI / validation (active invoices only).
 * Supports partial invoicing display: ordered / invoiced / remaining qty per line.
 */
export async function getSalesOrderBillingSnapshot(soOrId, session = null) {
    const soId = soOrId?._id || soOrId;
    if (!soId) {
        return {
            hasActiveInvoices: false,
            anyInvoiced: false,
            fullyInvoiced: false,
            lines: [],
            activeInvoices: [],
        };
    }

    let so = soOrId;
    if (!so?.items) {
        so = await SalesOrder.findById(soId).session(session).lean();
    } else if (typeof so.toObject === 'function') {
        so = so.toObject();
    }
    if (!so) {
        return {
            hasActiveInvoices: false,
            anyInvoiced: false,
            fullyInvoiced: false,
            lines: [],
            activeInvoices: [],
        };
    }

    const activeInvoicesFull = await SalesInvoice.find({
        soId: so._id,
        isDeleted: { $ne: true },
        status: { $ne: 'Cancelled' },
    })
        .sort({ invoiceDate: 1, createdAt: 1 })
        .session(session)
        .lean();

    const soItems = so.items || [];
    const invoicedByLineId = sumActiveInvoicedQtyBySoLine(soItems, activeInvoicesFull);
    const activeInvoices = activeInvoicesFull.map((inv) => ({
        _id: inv._id,
        invoiceNumber: inv.displayInvoiceNumber || inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        status: inv.status,
    }));

    let anyInvoiced = false;
    let allFullyInvoiced = soItems.length > 0;

    const lines = soItems.map((soItem) => {
        const orderedQty = Number(soItem.qty) || 0;
        const invoicedQty = soItem._id ? (invoicedByLineId.get(String(soItem._id)) || 0) : 0;
        // Allow negative remaining (over-invoicing is a valid business rule).
        const remainingQty = r2(orderedQty - invoicedQty);
        if (invoicedQty > 0.0001) anyInvoiced = true;
        if (invoicedQty < orderedQty - 0.0001) allFullyInvoiced = false;
        return {
            lineId: soItem._id,
            itemId: soItem.itemId || null,
            itemName: soItem.itemName || '',
            orderedQty,
            invoicedQty: r2(invoicedQty),
            remainingQty,
            overInvoiced: remainingQty < -0.0001,
            lineKey: soItem._id ? `line:${String(soItem._id)}` : productKey(soItem),
        };
    });

    if (soItems.length === 0) allFullyInvoiced = false;

    return {
        hasActiveInvoices: activeInvoices.length > 0,
        anyInvoiced,
        fullyInvoiced: anyInvoiced && allFullyInvoiced,
        lines,
        activeInvoices,
    };
}

/**
 * Evaluate invoice qty vs SO-line remaining. NEVER blocks over-invoicing.
 * Remaining is tracked per Sales Order LINE (salesOrderLineId); duplicate products stay independent.
 * Legacy payloads without salesOrderLineId allocate FIFO within the same SO, then apply excess
 * to the last matching line (remaining may go negative).
 *
 * @returns {{ overInvoiced: boolean, warnings: Array<object> }}
 */
export function evaluateInvoiceItemsAgainstRemaining(so, invoiceItems, billingSnapshot) {
    const empty = { overInvoiced: false, warnings: [] };
    const snap = billingSnapshot;
    if (!so || !snap?.lines?.length) return empty;

    const remainingByLineId = new Map();
    const metaByLineId = new Map();
    const fifoByProduct = new Map();

    for (const soItem of so.items || []) {
        const lineId = soItem?._id ? String(soItem._id) : null;
        if (!lineId) continue;
        const line = snap.lines.find((l) => String(l.lineId) === lineId);
        const orderedQty = line ? Number(line.orderedQty) : (Number(soItem.qty) || 0);
        const invoicedQty = line ? Number(line.invoicedQty) || 0 : 0;
        const rem = line != null ? Number(line.remainingQty) : orderedQty;
        remainingByLineId.set(lineId, rem);
        metaByLineId.set(lineId, {
            orderedQty,
            alreadyInvoicedQty: invoicedQty,
            itemName: soItem.itemName || line?.itemName || '',
        });
        const pk = productKey(soItem);
        if (!fifoByProduct.has(pk)) fifoByProduct.set(pk, []);
        fifoByProduct.get(pk).push(lineId);
    }

    const warnings = [];

    const pushOverWarning = (lineId, remBefore, qty, remAfter, label) => {
        const meta = metaByLineId.get(lineId) || {};
        warnings.push({
            overInvoiced: true,
            salesOrderLineId: lineId,
            itemName: label || meta.itemName || '',
            orderedQty: meta.orderedQty ?? null,
            alreadyInvoicedQty: meta.alreadyInvoicedQty ?? null,
            remainingBefore: remBefore,
            invoiceQty: qty,
            remainingAfter: remAfter,
            message:
                `Sales Order remaining quantity is ${remBefore}. ` +
                `Current invoice quantity is ${qty}. ` +
                `Remaining after invoice will be ${remAfter}.`,
        });
    };

    for (const invItem of invoiceItems || []) {
        const qty = Number(invItem.qty) || 0;
        if (qty <= 0) continue;
        const label = invItem.itemName || invItem.itemCode || productKey(invItem);
        const soLineId = resolveInvoiceSalesOrderLineId(invItem);

        if (soLineId && remainingByLineId.has(soLineId)) {
            const remBefore = remainingByLineId.get(soLineId) ?? 0;
            const remAfter = r2(remBefore - qty);
            remainingByLineId.set(soLineId, remAfter);
            if (qty > remBefore + 0.0001) {
                pushOverWarning(soLineId, remBefore, qty, remAfter, label);
            }
            continue;
        }

        // Legacy / missing salesOrderLineId: FIFO within SO for same product; excess → last line.
        const pool = fifoByProduct.get(productKey(invItem)) || [];
        if (!pool.length) continue;

        const remBeforeProduct = r2(pool.reduce((s, id) => s + (remainingByLineId.get(id) ?? 0), 0));
        let left = qty;
        for (const lineId of pool) {
            if (left <= 0.0001) break;
            const rem = remainingByLineId.get(lineId) ?? 0;
            if (rem <= 0.0001) continue;
            const take = Math.min(rem, left);
            remainingByLineId.set(lineId, r2(rem - take));
            left = r2(left - take);
        }
        if (left > 0.0001) {
            const target = pool[pool.length - 1];
            const rem = remainingByLineId.get(target) ?? 0;
            remainingByLineId.set(target, r2(rem - left));
            left = 0;
        }
        const remAfterProduct = r2(pool.reduce((s, id) => s + (remainingByLineId.get(id) ?? 0), 0));
        if (qty > remBeforeProduct + 0.0001) {
            pushOverWarning(pool[pool.length - 1], remBeforeProduct, qty, remAfterProduct, label);
        }
    }

    return {
        overInvoiced: warnings.length > 0,
        warnings,
    };
}

/**
 * Name kept for call sites — over-invoicing is ALLOWED (non-blocking).
 * Returns evaluateInvoiceItemsAgainstRemaining result; does not throw on excess qty.
 */
export function assertInvoiceItemsWithinRemaining(so, invoiceItems, billingSnapshot) {
    return evaluateInvoiceItemsAgainstRemaining(so, invoiceItems, billingSnapshot);
}

/**
 * Before creating a new invoice: refresh SO billing from ACTIVE invoices.
 * Does NOT block when SO is already fully/over invoiced — further invoices may make remaining negative.
 * Still blocks Draft and terminal statuses (Cancelled / Closed / Completed).
 */
export async function prepareSalesOrderForInvoiceCreation(soId, session = null) {
    const so = await recalculateSalesOrderBillingFromInvoices(soId, session);
    if (!so) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Linked Sales Order not found');
    }
    if (so.status === 'Draft') {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Sales Order must be Confirmed before creating a Tax Invoice'
        );
    }
    if (ORDER_TERMINAL_STATUSES.has(so.status)) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Sales Order ${so.soNumber || ''} is ${so.status} and cannot be invoiced`
        );
    }
    return so;
}
