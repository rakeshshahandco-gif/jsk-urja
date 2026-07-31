import { ExtractorSettings } from '../../../models/extractorSettings.model.js';
import { DEFAULT_SETTINGS, PERMS } from './constants.js';
import { assertPerm, assertView } from './permissions.util.js';
import { rejectTenantOverrides, assertNoSecrets } from './normalize.util.js';
import { writeAudit } from './family.service.js';

export async function getSettings(companyId, user = null) {
    if (user) assertView(user);
    const doc = await ExtractorSettings.findOne({ companyId }).lean();
    const stored = doc?.aiLeadIntelligence?.configurationManager || {};
    return { ...DEFAULT_SETTINGS, ...stored, companyId: undefined };
}

export async function saveSettings(companyId, userId, body = {}, user = null) {
    assertPerm(user, PERMS.settings);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    const next = {
        ...DEFAULT_SETTINGS,
        enabled: body.enabled !== false,
        allowManualDraftWithoutSpec: body.allowManualDraftWithoutSpec !== false,
        requireChecksumMatchForSpec: body.requireChecksumMatchForSpec !== false,
        rejectExecutableSpecifications: body.rejectExecutableSpecifications !== false,
        allowReadyForSandboxWithoutWarnings: !!body.allowReadyForSandboxWithoutWarnings,
        missingProductMasterPolicy: ['REJECT', 'WARN'].includes(body.missingProductMasterPolicy)
            ? body.missingProductMasterPolicy : 'REJECT',
        missingIndustryPolicy: ['REJECT', 'WARN'].includes(body.missingIndustryPolicy)
            ? body.missingIndustryPolicy : 'WARN',
    };
    let doc = await ExtractorSettings.findOne({ companyId });
    if (!doc) {
        doc = new ExtractorSettings({ companyId, aiLeadIntelligence: { configurationManager: next } });
    } else {
        const ali = { ...(doc.aiLeadIntelligence?.toObject?.() || doc.aiLeadIntelligence || {}) };
        ali.configurationManager = next;
        doc.aiLeadIntelligence = ali;
    }
    await doc.save();
    await writeAudit(companyId, userId, 'settings_saved', 'SETTINGS', null, { version: next.version });
    return next;
}
