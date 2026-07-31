import { ArSetting } from '../../../models/arSetting.model.js';
import { DEFAULT_SETTINGS, PERMS } from './constants.js';
import { assertView, assertPerm } from './permissions.util.js';
import { rejectTenantOverrides, assertPayloadSafe, forceSimulationOnly, stripUnsafeWriteFields } from './normalize.util.js';
import { writeAudit } from './audit.util.js';

export async function getSettings(companyId, user = null) {
    assertView(user);
    const doc = await ArSetting.findOne({ companyId }).lean();
    const settings = { ...DEFAULT_SETTINGS, ...(doc?.settings || {}) };
    settings.simulationOnly = true;
    settings.manualDeploymentOnly = true;
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
        simulationOnly: true, manualDeploymentOnly: true,
        productionExecutionAllowed: false, deploymentEnabled: false,
    };
    const doc = await ArSetting.findOneAndUpdate(
        { companyId },
        {
            companyId, settings, version: DEFAULT_SETTINGS.version,
            simulationOnly: true, manualDeploymentOnly: true,
            productionExecutionAllowed: false, deploymentEnabled: false, updatedBy: userId,
        },
        { upsert: true, new: true },
    ).lean();
    await writeAudit(companyId, userId, 'SETTINGS_UPDATE', 'ArSetting', doc._id, { settings });
    return forceSimulationOnly({ settings: doc.settings, version: doc.version });
}