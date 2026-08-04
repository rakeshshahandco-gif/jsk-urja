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

function lineKey(item) {
    if (item?.itemId) return `id:${String(item.itemId)}`;
    return `name:${String(item.itemName || '').trim().toLowerCase()}`;
}

/**
 * Sum invoiced qty per SO line from ACTIVE invoices only (not cancelled, not deleted).
 */
function sumActiveInvoicedQtyByKey(activeInvoices) {
    const map = new Map();
    for (const inv of activeInvoices) {
        for (const line of inv.items || []) {
            const key = lineKey(line);
            map.set(key, r2((map.get(key) || 0) + (Number(line.qty) || 0)));
        }
    }
    return map;
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

    const invoicedByKey = sumActiveInvoicedQtyByKey(activeInvoices);
    const soItems = so.items || [];
    let anyInvoiced = false;
    let allFullyInvoiced = soItems.length > 0;

    for (const soItem of soItems) {
        const orderedQty = Number(soItem.qty) || 0;
        const invoicedQty = invoicedByKey.get(lineKey(soItem)) || 0;
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

    const invoicedByKey = sumActiveInvoicedQtyByKey(activeInvoicesFull);
    const activeInvoices = activeInvoicesFull.map((inv) => ({
        _id: inv._id,
        invoiceNumber: inv.displayInvoiceNumber || inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        status: inv.status,
    }));

    const soItems = so.items || [];
    let anyInvoiced = false;
    let allFullyInvoiced = soItems.length > 0;

    const lines = soItems.map((soItem) => {
        const orderedQty = Number(soItem.qty) || 0;
        const invoicedQty = invoicedByKey.get(lineKey(soItem)) || 0;
        const remainingQty = r2(Math.max(0, orderedQty - invoicedQty));
        if (invoicedQty > 0.0001) anyInvoiced = true;
        if (invoicedQty < orderedQty - 0.0001) allFullyInvoiced = false;
        return {
            lineId: soItem._id,
            itemId: soItem.itemId || null,
            itemName: soItem.itemName || '',
            orderedQty,
            invoicedQty: r2(invoicedQty),
            remainingQty,
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
 * Block creating invoice lines that exceed remaining (ordered − active invoiced) qty.
 * Preserves partial invoicing; does not change full-remaining behaviour.
 */
export function assertInvoiceItemsWithinRemaining(so, invoiceItems, billingSnapshot) {
    const snap = billingSnapshot;
    if (!so || !snap?.lines?.length) return;

    const remainingByKey = new Map();
    for (const soItem of so.items || []) {
        const line = snap.lines.find((l) => String(l.lineId) === String(soItem._id));
        const rem = line ? line.remainingQty : (Number(soItem.qty) || 0);
        remainingByKey.set(lineKey(soItem), rem);
    }

    for (const invItem of invoiceItems || []) {
        const key = lineKey(invItem);
        if (!remainingByKey.has(key)) continue;
        const rem = remainingByKey.get(key);
        const qty = Number(invItem.qty) || 0;
        if (qty > rem + 0.0001) {
            throw new ApiError(
                httpStatus.BAD_REQUEST,
                `Cannot invoice more than remaining quantity for "${invItem.itemName || key}". ` +
                `Requested ${qty}, available ${rem}.`
            );
        }
        remainingByKey.set(key, r2(rem - qty));
    }
}

/**
 * Before creating a new invoice: refresh SO billing from ACTIVE invoices only,
 * then block only when an active invoice still fully covers the order.
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
    if (so.status === 'Invoiced') {
        const billing = await getSalesOrderBillingSnapshot(so, session);
        const existing = billing.activeInvoices?.[0] || null;
        const err = new ApiError(
            httpStatus.CONFLICT,
            'A Tax Invoice has already been created from this Sales Order.'
        );
        err.data = {
            code: 'SO_ALREADY_INVOICED',
            existingInvoice: existing,
            activeInvoices: billing.activeInvoices || [],
        };
        throw err;
    }
    return so;
}
