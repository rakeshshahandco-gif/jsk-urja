import { ArAudit } from '../../../models/arAudit.model.js';
import { assertNoSecrets } from './normalize.util.js';

export async function writeAudit(companyId, userId, action, entityType, entityId, details = {}, extra = {}) {
    assertNoSecrets(details);
    await ArAudit.create({
        companyId: extra.platformScoped ? null : companyId,
        platformScoped: !!extra.platformScoped,
        action,
        entityType,
        entityId: entityId || null,
        activationProgramId: extra.activationProgramId || null,
        beforeSummary: extra.beforeSummary || null,
        afterSummary: extra.afterSummary || null,
        reason: extra.reason || '',
        details: {
            ...details,
            simulationOnly: true,
            manualDeploymentOnly: true,
            productionExecutionAllowed: false,
            deploymentExecuted: false,
            productionActivated: false,
        },
        actorUserId: userId,
        actorRole: extra.actorRole || '',
        simulationOnly: true,
        manualDeploymentOnly: true,
        productionExecutionAllowed: false,
        deploymentExecuted: false,
        productionActivated: false,
    });
}