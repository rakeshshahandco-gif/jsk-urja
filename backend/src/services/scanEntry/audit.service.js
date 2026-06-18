import { ScanEntryAuditLog } from '../../models/scanEntryAuditLog.model.js';

export async function logAudit(draftId, action, userId, oldValue = null, newValue = null) {
    return ScanEntryAuditLog.create({ draftId, action, userId, oldValue, newValue });
}

