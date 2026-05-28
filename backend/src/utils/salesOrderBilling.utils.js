import mongoose from 'mongoose';
import httpStatus from 'http-status';
import { SalesOrder } from '../models/salesOrder.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { ApiError } from './ApiError.js';

const ORDER_TERMINAL_STATUSES = new Set(['Cancelled', 'Closed', 'Completed']);

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
 * Before creating a new invoice: refresh SO billing from ACTIVE invoices only,
 * then block only when an active invoice still fully covers the order.
 */
export async function prepareSalesOrderForInvoiceCreation(soId, session = null) {
    const so = await recalculateSalesOrderBillingFromInvoices(soId, session);
    if (!so) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Linked Sales Order not found');
    }
    if (ORDER_TERMINAL_STATUSES.has(so.status)) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Sales Order ${so.soNumber || ''} is ${so.status} and cannot be invoiced`
        );
    }
    if (so.status === 'Invoiced') {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'This sales order is already fully invoiced by active invoice(s). ' +
            'Cancelled and deleted invoices do not count — cancel/delete the active invoice first, or use a new sales order.'
        );
    }
    return so;
}
