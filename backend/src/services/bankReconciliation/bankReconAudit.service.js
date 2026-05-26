import { BankReconAuditLog } from '../../models/bankReconAuditLog.model.js';

export async function logBankReconAudit({
    action,
    cashBankAccountId,
    importId,
    bankLineId,
    reconciliationId,
    voucherId,
    userId,
    payload,
    previousState,
    newState,
    reason,
}) {
    return BankReconAuditLog.create({
        action,
        cashBankAccountId,
        importId,
        bankLineId,
        reconciliationId,
        voucherId,
        userId,
        payload,
        previousState,
        newState,
        reason: reason || '',
    });
}
