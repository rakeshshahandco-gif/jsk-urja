import { ProductionReadinessAudit } from '../../../models/productionReadinessAudit.model.js';
import { assertNoSecrets } from './normalize.util.js';

export async function writeAudit(companyId, userId, action, entityType, entityId, details = {}, platformScoped = false) {
    assertNoSecrets(details);
    await ProductionReadinessAudit.create({
        companyId: platformScoped ? null : companyId,
        platformScoped,
        action,
        entityType,
        entityId: entityId || null,
        details: { ...details, executable: false, deploymentAuthorized: false, productionApproved: false },
        actorUserId: userId,
    });
}
