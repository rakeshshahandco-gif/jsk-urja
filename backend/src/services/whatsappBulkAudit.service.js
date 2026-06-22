import WhatsAppBulkAuditLog from '../models/whatsappBulkAuditLog.model.js';

export async function logAudit(companyId, action, { campaignId = null, userId = null, details = {} } = {}) {
    await WhatsAppBulkAuditLog.create({
        companyId,
        campaignId,
        action,
        userId,
        details,
    });
}

export async function listAuditLogs(companyId, { campaignId, limit = 100 } = {}) {
    const q = { companyId };
    if (campaignId) q.campaignId = campaignId;
    return WhatsAppBulkAuditLog.find(q).sort({ createdAt: -1 }).limit(limit).lean();
}
