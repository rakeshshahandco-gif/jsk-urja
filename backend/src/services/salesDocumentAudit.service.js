/**
 * Append-only Sales Document forensic writer.
 * Never throws to the caller — financial posting must not fail because of audit.
 * Never updates Sales Order or Sales Invoice documents.
 */
import logger from '../utils/logger.js';
import { SalesDocumentAudit } from '../models/salesDocumentAudit.model.js';
import { SALES_DOC_AUDIT_ACTIONS } from '../constants/salesDocumentAudit.constants.js';
import {
    actorFromRequest,
    attachRequestId,
    requestMetaFromReq,
    snapshotSalesOrderBillingLink,
    diffChangedFields,
} from '../utils/salesDocumentAudit.util.js';

function stripSecrets(details = {}) {
    const blocked = ['password', 'token', 'jwt', 'accessToken', 'refreshToken', 'cookie', 'authorization', 'secret'];
    const out = {};
    for (const [key, value] of Object.entries(details || {})) {
        if (blocked.some((b) => key.toLowerCase().includes(b))) continue;
        out[key] = value;
    }
    return out;
}

export async function recordSalesDocumentAudit(entry = {}) {
    try {
        const doc = {
            forensicKind: 'SALES_DOCUMENT',
            module: 'SalesDocumentForensic',
            description: entry.action,
            action: entry.action,
            reason: entry.reason || '',
            actorType: entry.actorType || 'SYSTEM',
            actorUserId: entry.actorUserId || null,
            user: entry.actorUserId || null,
            actorName: entry.actorName || '',
            actorUsername: entry.actorUsername || '',
            actorRole: entry.actorRole || '',
            occurredAt: entry.occurredAt || new Date(),
            requestId: entry.requestId || '',
            httpMethod: entry.httpMethod || '',
            apiRoute: entry.apiRoute || '',
            sourceModule: entry.sourceModule || '',
            creationSource: entry.creationSource || '',
            ipAddress: entry.ipAddress || '',
            userAgent: entry.userAgent || '',
            companyId: entry.companyId || null,
            financialYear: entry.financialYear || '',
            financialYearId: entry.financialYearId || '',
            sessionRef: entry.sessionRef || '',
            salesInvoiceId: entry.salesInvoiceId || null,
            invoiceNumber: entry.invoiceNumber || '',
            salesOrderId: entry.salesOrderId || null,
            salesOrderNumber: entry.salesOrderNumber || '',
            relatedInvoiceId: entry.relatedInvoiceId || null,
            relatedInvoiceNumber: entry.relatedInvoiceNumber || '',
            idempotencyKey: entry.idempotencyKey || '',
            changedFields: entry.changedFields || [],
            details: stripSecrets(entry.details || {}),
        };
        await SalesDocumentAudit.create(doc);
        return true;
    } catch (err) {
        logger.error(`[salesDocumentAudit] write failed (financial document was not rolled back): ${err.message}`);
        return false;
    }
}

export function forensicContext(req, body = {}) {
    const requestId = requestMetaFromReq(req, body).requestId;
    attachRequestId(req.res, requestId);
    return {
        ...actorFromRequest(req),
        ...requestMetaFromReq(req, body),
    };
}

export async function recordFromRequest(req, body, extra = {}) {
    const ctx = forensicContext(req, body || req.body || {});
    return recordSalesDocumentAudit({ ...ctx, ...extra });
}

export async function recordSoBillingRecalcIfChanged({
    req,
    body,
    before,
    after,
    relatedInvoiceId = null,
    relatedInvoiceNumber = '',
    reason = '',
}) {
    if (!after) return false;
    const changedFields = diffChangedFields(
        snapshotSalesOrderBillingLink(before),
        snapshotSalesOrderBillingLink(after),
        ['status', 'invoiceId'],
    );
    if (!changedFields.length) return false;
    return recordFromRequest(req, body, {
        action: SALES_DOC_AUDIT_ACTIONS.SO_BILLING_RECALC,
        reason: reason || 'INVOICE_BILLING_RECALCULATION',
        sourceModule: 'salesOrder.billing',
        salesOrderId: after._id || before?._id || null,
        salesOrderNumber: after.soNumber || before?.soNumber || '',
        relatedInvoiceId,
        relatedInvoiceNumber,
        changedFields,
        details: { billingFieldsOnly: true },
    });
}

const inFlightInvoiceBySo = new Map();

export function markInvoiceCreateInFlight(soId, requestId) {
    if (!soId) return { concurrent: false, otherRequestId: '' };
    const key = String(soId);
    const existing = inFlightInvoiceBySo.get(key);
    if (existing && existing !== requestId) {
        return { concurrent: true, otherRequestId: existing };
    }
    inFlightInvoiceBySo.set(key, requestId);
    return { concurrent: false, otherRequestId: '' };
}

export function clearInvoiceCreateInFlight(soId, requestId) {
    if (!soId) return;
    const key = String(soId);
    if (inFlightInvoiceBySo.get(key) === requestId) {
        inFlightInvoiceBySo.delete(key);
    }
}

export { SALES_DOC_AUDIT_ACTIONS };
