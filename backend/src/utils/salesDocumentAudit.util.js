import crypto from 'crypto';
import { SALES_DOC_ACTOR_TYPES } from '../constants/salesDocumentAudit.constants.js';

function asId(value) {
    if (!value) return null;
    if (typeof value === 'object' && (value._id || value.id)) return String(value._id || value.id);
    return String(value);
}

function comparable(value) {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object' && value._id) return String(value._id);
    if (typeof value === 'number') return Number(value);
    if (typeof value === 'boolean') return value;
    return String(value);
}

/**
 * Changed fields only. Never includes computed remaining qty.
 */
export function diffChangedFields(before = {}, after = {}, keys = []) {
    const changed = [];
    for (const key of keys) {
        const from = comparable(before[key]);
        const to = comparable(after[key]);
        if (from !== to) {
            changed.push({ field: key, from: before[key] ?? null, to: after[key] ?? null });
        }
    }
    return changed;
}

export function snapshotSalesOrderBillingLink(so) {
    if (!so) return { status: null, invoiceId: null, soNumber: '' };
    return {
        status: so.status || null,
        invoiceId: asId(so.invoiceId),
        soNumber: so.soNumber || '',
    };
}

export function snapshotSalesOrderManual(so) {
    if (!so) return {};
    return {
        soNumber: so.soNumber || '',
        status: so.status || null,
        invoiceId: asId(so.invoiceId),
        customerName: so.customerName || '',
        customerId: asId(so.customerId),
        soDate: so.soDate || null,
        deliveryDate: so.deliveryDate || null,
        seriesId: asId(so.seriesId),
        gstType: so.gstType || '',
        gstApplicable: so.gstApplicable,
        freightAmount: so.freightAmount,
        remarks: so.remarks || '',
        paymentType: so.paymentType || '',
        items: (so.items || []).map((item) => ({
            lineId: asId(item._id),
            itemName: item.itemName || '',
            qty: Number(item.qty) || 0,
            rate: Number(item.rate) || 0,
        })),
    };
}

export function diffSalesOrderManual(before, after) {
    const scalarKeys = [
        'soNumber', 'status', 'invoiceId', 'customerName', 'customerId',
        'soDate', 'deliveryDate', 'seriesId', 'gstType', 'gstApplicable',
        'freightAmount', 'remarks', 'paymentType',
    ];
    const changed = diffChangedFields(before, after, scalarKeys);
    const beforeItems = before.items || [];
    const afterItems = after.items || [];
    const byId = new Map(afterItems.map((item) => [item.lineId || `${item.itemName}:${item.qty}`, item]));
    const seen = new Set();
    for (const prev of beforeItems) {
        const key = prev.lineId || `${prev.itemName}:${prev.qty}`;
        seen.add(key);
        const next = byId.get(key);
        if (!next) {
            changed.push({ field: `items.${key}`, from: prev, to: null });
            continue;
        }
        if (prev.qty !== next.qty) {
            changed.push({ field: `items.${key}.qty`, from: prev.qty, to: next.qty });
        }
        if (prev.rate !== next.rate) {
            changed.push({ field: `items.${key}.rate`, from: prev.rate, to: next.rate });
        }
        if (prev.itemName !== next.itemName) {
            changed.push({ field: `items.${key}.itemName`, from: prev.itemName, to: next.itemName });
        }
    }
    for (const next of afterItems) {
        const key = next.lineId || `${next.itemName}:${next.qty}`;
        if (!seen.has(key) && !beforeItems.some((p) => (p.lineId && p.lineId === next.lineId))) {
            changed.push({ field: `items.${key}`, from: null, to: next });
        }
    }
    return changed;
}

export function actorFromRequest(req = {}) {
    const user = req.user;
    if (!user || !(user._id || user.id)) {
        return {
            actorType: SALES_DOC_ACTOR_TYPES.SYSTEM,
            actorUserId: null,
            actorName: 'SYSTEM',
            actorUsername: '',
            actorRole: 'SYSTEM',
        };
    }
    return {
        actorType: SALES_DOC_ACTOR_TYPES.USER,
        actorUserId: user._id || user.id,
        actorName: String(user.name || '').trim(),
        actorUsername: String(user.username || '').trim(),
        actorRole: String(user.roleName || user.role?.name || (typeof user.role === 'string' ? user.role : '')).trim(),
    };
}

export function ensureSalesRequestId(req = {}, body = {}) {
    const fromHeader = req.headers?.['x-request-id'] || req.headers?.['x-correlation-id'] || '';
    const fromBody = body.requestId || body.correlationId || '';
    const existing = String(req.salesRequestId || fromHeader || fromBody || '').trim();
    const requestId = existing || `sd-req-${crypto.randomUUID()}`;
    req.salesRequestId = requestId;
    return requestId;
}

export function requestMetaFromReq(req = {}, body = {}) {
    const requestId = ensureSalesRequestId(req, body);
    const sessionRef = String(
        req.headers?.['x-session-id']
        || req.headers?.['x-client-session']
        || '',
    ).trim().slice(0, 120);
    return {
        requestId,
        httpMethod: String(req.method || '').slice(0, 12),
        apiRoute: String(req.originalUrl || req.path || '').slice(0, 400),
        ipAddress: String(req.ip || req.headers?.['x-forwarded-for'] || '').slice(0, 120),
        userAgent: String(req.headers?.['user-agent'] || '').slice(0, 500),
        companyId: req.companyId || null,
        financialYear: String(body.financialYear || req.headers?.['x-financial-year'] || req.query?.financialYear || '').trim(),
        financialYearId: String(body.financialYearId || req.headers?.['x-financial-year-id'] || req.financialYearId || '').trim(),
        sessionRef,
    };
}

export function attachRequestId(res, requestId) {
    if (!res || !requestId) return;
    try {
        res.setHeader('X-Request-Id', requestId);
    } catch {
        /* headers may already be sent */
    }
}
