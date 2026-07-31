import { ExtractorSettings } from '../../../models/extractorSettings.model.js';
import { DEFAULT_SETTINGS, SETTINGS_VERSION, ENGINE_VERSION } from './constants.js';
import { assertNoSecrets } from './normalize.util.js';
import { assertManage, assertView } from './permissions.util.js';

function clone(o) {
    return JSON.parse(JSON.stringify(o));
}

export function normalizeKgSettings(raw = {}) {
    const base = clone(DEFAULT_SETTINGS);
    const incoming = raw && typeof raw === 'object' ? raw : {};
    return {
        ...base,
        ...incoming,
        version: String(incoming.version || SETTINGS_VERSION),
        engineVersion: ENGINE_VERSION,
        defaultResultLimit: Math.max(1, Number(incoming.defaultResultLimit ?? base.defaultResultLimit) || 50),
        maximumResultLimit: Math.max(1, Number(incoming.maximumResultLimit ?? base.maximumResultLimit) || 200),
        maximumGraphNodes: Math.max(10, Number(incoming.maximumGraphNodes ?? base.maximumGraphNodes) || 80),
        maximumEvidenceItems: Math.max(1, Number(incoming.maximumEvidenceItems ?? base.maximumEvidenceItems) || 40),
        minConfidenceToShow: Math.max(0, Math.min(100, Number(incoming.minConfidenceToShow ?? base.minConfidenceToShow) || 40)),
        autoDiscoverOnRead: incoming.autoDiscoverOnRead === true,
        allowExport: incoming.allowExport !== false,
    };
}

export async function getKgSettings(companyId) {
    const doc = await ExtractorSettings.findOne({ companyId }).lean();
    return normalizeKgSettings(doc?.aiLeadIntelligence?.knowledgeGraph || {});
}

export async function saveKgSettings(companyId, userId, payload = {}, user = null) {
    if (user) assertManage(user);
    assertNoSecrets(payload);
    const normalized = normalizeKgSettings(payload);
    assertNoSecrets(normalized);
    const existing = await ExtractorSettings.findOne({ companyId });
    if (!existing) {
        await ExtractorSettings.create({
            companyId,
            aiLeadIntelligence: { knowledgeGraph: normalized },
            updatedBy: userId || null,
        });
        return normalized;
    }
    const ali = { ...(existing.aiLeadIntelligence?.toObject?.() || existing.aiLeadIntelligence || {}) };
    ali.knowledgeGraph = normalized;
    existing.aiLeadIntelligence = ali;
    existing.updatedBy = userId || null;
    await existing.save();
    return normalized;
}

export async function getSettingsForUser(companyId, user) {
    assertView(user);
    return getKgSettings(companyId);
}
