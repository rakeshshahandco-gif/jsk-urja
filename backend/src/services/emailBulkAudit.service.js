import EmailAuditLog from '../models/emailAuditLog.model.js';

export async function logAudit(companyId, action, { campaignId = null, userId = null, details = {} } = {}) {
    await EmailAuditLog.create({
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
    return EmailAuditLog.find(q).sort({ createdAt: -1 }).limit(limit).lean();
}
