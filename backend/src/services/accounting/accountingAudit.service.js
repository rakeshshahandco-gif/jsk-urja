import { AccountingAuditLog } from '../../models/accountingAuditLog.model.js';

/**
 * Append-only accounting audit. Never update or delete via this service.
 */
export async function logAccountingAudit({
    action,
    moduleSource,
    resourceType,
    resourceId,
    voucherNo = '',
    financialYear = '',
    userId = null,
    reason = '',
    oldValue = null,
    newValue = null,
    ipAddress = '',
    session = null,
}) {
    const doc = {
        action,
        moduleSource,
        resourceType,
        resourceId,
        voucherNo,
        financialYear,
        userId,
        reason,
        oldValue,
        newValue,
        ipAddress,
    };
    if (session) {
        await AccountingAuditLog.create([doc], { session });
    } else {
        await AccountingAuditLog.create(doc);
    }
}
