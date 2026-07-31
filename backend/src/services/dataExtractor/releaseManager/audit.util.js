import { ReleaseAudit } from '../../../models/releaseAudit.model.js';
import { assertNoSecrets } from './normalize.util.js';

export async function writeAudit(companyId, userId, action, entityType, entityId, details = {}, platformScoped = false) {
    assertNoSecrets(details);
    await ReleaseAudit.create({
        companyId, userId, action, entityType, entityId, details, platformScoped,
    });
}
