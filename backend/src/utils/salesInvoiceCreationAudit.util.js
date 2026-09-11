import crypto from 'crypto';
import { SI_CREATION_SOURCES, SI_CREATION_SOURCE_VALUES } from '../constants/salesInvoiceCreation.constants.js';

export function isAllowedCreationSource(value) {
    return SI_CREATION_SOURCE_VALUES.includes(String(value || '').trim());
}

/**
 * Resolve a controlled creation source. Never returns UNKNOWN.
 */
export function resolveSalesInvoiceCreationSource({
    hintedSource,
    linkedSoId,
    requestPath = '',
    userAgent = '',
} = {}) {
    const hinted = String(hintedSource || '').trim();
    if (isAllowedCreationSource(hinted)) return hinted;

    const path = String(requestPath || '');
    const ua = String(userAgent || '');
    if (path.includes('/create-tax-invoice')) return SI_CREATION_SOURCES.API_SO_CONVERSION;
    if (path.includes('/scan-entry')) return SI_CREATION_SOURCES.SCAN_ENTRY_POST;
    if (linkedSoId) return SI_CREATION_SOURCES.WEB_SO_CONVERSION;
    if (/Mobile|Android|iPhone|ReactNative/i.test(ua)) return SI_CREATION_SOURCES.MOBILE_NEW_INVOICE;
    return SI_CREATION_SOURCES.WEB_NEW_INVOICE;
}

export function resolveRequestId(req = {}, body = {}) {
    const headerId =
        req.headers?.['x-request-id']
        || req.headers?.['x-correlation-id']
        || null;
    const fromBody = body.requestId || body.correlationId || null;
    const value = String(headerId || fromBody || '').trim();
    return value || `si-req-${crypto.randomUUID()}`;
}

export function resolveIdempotencyKey(req = {}, body = {}) {
    const raw = body.idempotencyKey || req.headers?.['idempotency-key'] || req.headers?.['Idempotency-Key'] || '';
    const value = String(raw || '').trim();
    return value || null;
}

export function buildSalesInvoiceCreationAuditFields({
    req = {},
    body = {},
    linkedSoId = null,
    soNumber = '',
} = {}) {
    const user = req.user || {};
    const path = req.originalUrl || req.path || body.creationRoute || '';
    const userAgent = req.headers?.['user-agent'] || body.userAgent || '';
    const creationSource = resolveSalesInvoiceCreationSource({
        hintedSource: body.creationSource,
        linkedSoId,
        requestPath: path,
        userAgent,
    });
    const sourceDocumentId = linkedSoId || body.sourceDocumentId || null;
    const sourceDocumentType = linkedSoId
        ? 'SalesOrder'
        : (creationSource === SI_CREATION_SOURCES.SCAN_ENTRY_POST ? 'ScanEntryDraft' : (body.sourceDocumentType || ''));
    return {
        createdByName: String(user.name || user.username || '').trim(),
        creationSource,
        creationRoute: String(body.creationRoute || path || '/api/v1/sales-invoices').slice(0, 300),
        sourceDocumentType: sourceDocumentType || '',
        sourceDocumentId: sourceDocumentId || null,
        sourceDocumentNumber: String(soNumber || body.soNumber || body.sourceDocumentNumber || '').trim(),
        idempotencyKey: resolveIdempotencyKey(req, body),
        requestId: resolveRequestId(req, body),
        createdFromUserAgent: String(userAgent || '').slice(0, 500),
        createdFromIp: String(req.ip || req.headers?.['x-forwarded-for'] || '').slice(0, 120),
    };
}
