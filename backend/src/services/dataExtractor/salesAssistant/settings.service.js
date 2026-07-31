import { ExtractorSettings } from '../../../models/extractorSettings.model.js';
import { DEFAULT_SETTINGS, SETTINGS_VERSION, ENGINE_VERSION } from './constants.js';
import { assertNoSecrets } from './normalize.util.js';
import { hasAssistant, assertView } from './permissions.util.js';
import { PERMS } from './constants.js';
import { ApiError } from '../../../utils/ApiError.js';

function clone(o) {
    return JSON.parse(JSON.stringify(o));
}

export function normalizeAssistantSettings(raw = {}) {
    const base = clone(DEFAULT_SETTINGS);
    const incoming = raw && typeof raw === 'object' ? raw : {};
    return {
        ...base,
        ...incoming,
        version: String(incoming.version || SETTINGS_VERSION),
        defaultResultLimit: Math.max(1, Number(incoming.defaultResultLimit ?? base.defaultResultLimit) || 20),
        maximumResultLimit: Math.max(1, Number(incoming.maximumResultLimit ?? base.maximumResultLimit) || 100),
        maximumContactRows: Math.max(1, Number(incoming.maximumContactRows ?? base.maximumContactRows) || 25),
        maximumExportRows: Math.max(1, Number(incoming.maximumExportRows ?? base.maximumExportRows) || 500),
        maximumEvidenceItems: Math.max(1, Number(incoming.maximumEvidenceItems ?? base.maximumEvidenceItems) || 30),
        maximumSessionMessages: Math.max(1, Number(incoming.maximumSessionMessages ?? base.maximumSessionMessages) || 200),
        queryTimeoutMs: Math.max(1000, Number(incoming.queryTimeoutMs ?? base.queryTimeoutMs) || 30000),
        sessionRetentionDays: Math.max(1, Number(incoming.sessionRetentionDays ?? base.sessionRetentionDays) || 90),
        aiTokenLimit: Math.max(100, Number(incoming.aiTokenLimit ?? base.aiTokenLimit) || 2000),
        mode: ['RULE_ONLY', 'TEMPLATE_ONLY', 'AI_ASSISTED', 'HYBRID'].includes(incoming.mode) ? incoming.mode : base.mode,
        aiAssistedEnabled: incoming.aiAssistedEnabled === true,
        allowExport: incoming.allowExport !== false,
        aggregateOnlyDefault: incoming.aggregateOnlyDefault === true,
        engineVersion: ENGINE_VERSION,
    };
}

export async function getAssistantSettings(companyId) {
    const doc = await ExtractorSettings.findOne({ companyId }).lean();
    return normalizeAssistantSettings(doc?.aiLeadIntelligence?.salesAssistant || {});
}

export async function saveAssistantSettings(companyId, userId, payload = {}, user = null) {
    if (user && !hasAssistant(user, PERMS.manage)) {
        throw new ApiError(403, `Missing permission: ${PERMS.manage}`);
    }
    assertNoSecrets(payload);
    const normalized = normalizeAssistantSettings(payload);
    assertNoSecrets(normalized);
    const existing = await ExtractorSettings.findOne({ companyId });
    if (!existing) {
        await ExtractorSettings.create({
            companyId,
            aiLeadIntelligence: { salesAssistant: normalized },
            updatedBy: userId || null,
        });
        return normalized;
    }
    const ali = { ...(existing.aiLeadIntelligence?.toObject?.() || existing.aiLeadIntelligence || {}) };
    ali.salesAssistant = normalized;
    existing.aiLeadIntelligence = ali;
    existing.updatedBy = userId || null;
    await existing.save();
    return normalized;
}

export async function getSettingsForUser(companyId, user) {
    assertView(user);
    return getAssistantSettings(companyId);
}
