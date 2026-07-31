import { ExtractorSettings } from '../../../models/extractorSettings.model.js';
import { DEFAULT_SETTINGS, PERMS } from './constants.js';
import { assertPerm, assertView } from './permissions.util.js';
import { rejectTenantOverrides, assertNoSecrets } from './normalize.util.js';
import { writeAudit } from './audit.util.js';

export async function getSettings(companyId, user = null) {
    if (user) assertView(user);
    const doc = await ExtractorSettings.findOne({ companyId }).lean();
    const stored = doc?.aiLeadIntelligence?.readinessCertification || {};
    return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.settings);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const next = {
        ...DEFAULT_SETTINGS,
        ...Object.fromEntries(
            Object.keys(DEFAULT_SETTINGS).filter((k) => k in body).map((k) => [k, body[k]]),
        ),
        version: DEFAULT_SETTINGS.version,
        engineVersion: DEFAULT_SETTINGS.engineVersion,
        enabled: body.enabled !== false,
    };
    let doc = await ExtractorSettings.findOne({ companyId });
    if (!doc) {
        doc = new ExtractorSettings({ companyId, aiLeadIntelligence: { readinessCertification: next } });
    } else {
        const ali = { ...(doc.aiLeadIntelligence?.toObject?.() || doc.aiLeadIntelligence || {}) };
        ali.readinessCertification = next;
        doc.aiLeadIntelligence = ali;
    }
    await doc.save();
    await writeAudit(companyId, userId, 'settings_saved', 'SETTINGS', null, { version: next.version });
    return next;
}
