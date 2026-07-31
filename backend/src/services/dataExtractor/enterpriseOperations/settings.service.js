import { OpsSetting } from '../../../models/opsSetting.model.js';
import { DEFAULT_SETTINGS, PERMS } from './constants.js';
import { assertView, assertPerm } from './permissions.util.js';
import { rejectTenantOverrides, assertPayloadSafe, forceSimulationOnly, stripUnsafeWriteFields } from './normalize.util.js';
import { writeAudit } from './audit.util.js';

export async function getSettings(companyId, user = null) {
    assertView(user);
    const doc = await OpsSetting.findOne({ companyId }).lean();
    const settings = { ...DEFAULT_SETTINGS, ...(doc?.settings || {}) };
    settings.simulationOnly = true;
    settings.productionExecutionAllowed = false;
    settings.deploymentEnabled = false;
    return forceSimulationOnly({ settings, version: doc?.version || DEFAULT_SETTINGS.version });
}

export async function saveSettings(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.settings);
    rejectTenantOverrides(body);
    assertPayloadSafe(body);
    const incoming = stripUnsafeWriteFields(body.settings || body || {});
    const settings = {
        ...DEFAULT_SETTINGS, ...incoming,
        simulationOnly: true, productionExecutionAllowed: false, deploymentEnabled: false,
    };
    const doc = await OpsSetting.findOneAndUpdate(
        { companyId },
        { companyId, settings, version: DEFAULT_SETTINGS.version, simulationOnly: true, productionExecutionAllowed: false, deploymentEnabled: false, updatedBy: userId },
        { upsert: true, new: true },
    ).lean();
    await writeAudit(companyId, userId, 'SETTINGS_UPDATE', 'OpsSetting', doc._id, { settings });
    return forceSimulationOnly({ settings: doc.settings, version: doc.version });
}