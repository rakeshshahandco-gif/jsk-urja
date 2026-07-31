import { PilotAudit } from '../../../models/pilotAudit.model.js';
import { assertNoSecrets } from './normalize.util.js';

export async function writeAudit(companyId, userId, action, entityType, entityId, details = {}, extra = {}) {
    assertNoSecrets(details);
    await PilotAudit.create({
        companyId: extra.platformScoped ? null : companyId,
        platformScoped: !!extra.platformScoped,
        action,
        entityType,
        entityId: entityId || null,
        pilotProgramId: extra.pilotProgramId || null,
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
        ip: extra.ip || '',
        correlationId: extra.correlationId || '',
        simulationOnly: true,
        productionExecutionAllowed: false,
        deploymentExecuted: false,
        productionActivated: false,
    });
}