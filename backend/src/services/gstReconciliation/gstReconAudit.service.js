import { GstReconAuditLog } from '../../models/gstReconAuditLog.model.js';

export async function logGstReconAudit(payload) {
    return GstReconAuditLog.create(payload);
}
