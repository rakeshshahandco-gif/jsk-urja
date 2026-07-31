import { OpsAudit } from '../../../models/opsAudit.model.js';
import { assertNoSecrets } from './normalize.util.js';

export async function writeAudit(companyId, userId, action, entityType, entityId, details = {}, extra = {}) {
    assertNoSecrets(details);
    await OpsAudit.create({
        companyId: extra.platformScoped ? null : companyId,
        platformScoped: !!extra.platformScoped,
        action,
        entityType,
        entityId: entityId || null,
        operationsProgramId: extra.operationsProgramId || null,
        beforeSummary: extra.beforeSummary || null,
        afterSummary: extra.afterSummary || null,
        reason: extra.reason || '',
        details: {
            ...details,
            simulationOnly: true,
            productionExecutionAllowed: false,
            deploymentExecuted: false,
            productionActivated: false,
        },
        actorUserId: userId,
        actorRole: extra.actorRole || '',
        simulationOnly: true,
        productionExecutionAllowed: false,
        deploymentExecuted: false,
        productionActivated: false,
    });
}