import { CostingAuditLog } from '../models/costingAuditLog.model.js';

export async function logCostingAudit({ action, itemId, salesInvoiceId, productionSnapshotId, details, userId }) {
    try {
        await CostingAuditLog.create({
            action,
            itemId: itemId || null,
            salesInvoiceId: salesInvoiceId || null,
            productionSnapshotId: productionSnapshotId || null,
            details: details || {},
            userId: userId || null,
        });
    } catch {
        /* non-fatal */
    }
}

export async function listCostingAuditLogs(query = {}) {
    const q = {};
    if (query.action) q.action = query.action;
    if (query.itemId) q.itemId = query.itemId;
    return CostingAuditLog.find(q).sort({ createdAt: -1 }).limit(Number(query.limit) || 200).lean();
}
