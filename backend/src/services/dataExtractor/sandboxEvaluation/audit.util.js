import { SandboxEvaluationAudit } from '../../../models/sandboxEvaluationAudit.model.js';
import { assertNoSecrets } from './normalize.util.js';

export async function writeAudit(companyId, userId, action, entityType, entityId, details = {}) {
    assertNoSecrets(details);
    await SandboxEvaluationAudit.create({
        companyId, userId, action, entityType, entityId, details,
    });
}
