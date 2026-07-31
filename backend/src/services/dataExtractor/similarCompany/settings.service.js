import { ExtractorSettings } from '../../../models/extractorSettings.model.js';
import { DEFAULT_SIMILARITY_SETTINGS, SETTINGS_VERSION, ENGINE_VERSION } from './constants.js';

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

export function normalizeSimilaritySettings(raw = {}) {
    const base = clone(DEFAULT_SIMILARITY_SETTINGS);
    const incoming = raw && typeof raw === 'object' ? raw : {};
    return {
        ...base,
        ...incoming,
        version: String(incoming.version || SETTINGS_VERSION),
        dimensions: Array.isArray(incoming.dimensions) && incoming.dimensions.length
            ? incoming.dimensions.map((d) => ({
                id: String(d.id || '').trim(),
                label: String(d.label || d.id || '').trim(),
                weight: Math.max(0, Number(d.weight) || 0),
                maxScore: Math.max(0, Number(d.maxScore) || Number(d.weight) || 0),
                active: d.active !== false,
            })).filter((d) => d.id)
            : base.dimensions,
        maximumProviderCallsPerJob: Math.max(0, Number(incoming.maximumProviderCallsPerJob ?? base.maximumProviderCallsPerJob) || 0),
        requireConfirmationForPaidProvider: incoming.requireConfirmationForPaidProvider !== false,
        nameSimilarityForRelationshipOnly: incoming.nameSimilarityForRelationshipOnly !== false,
    };
}

export async function getSimilaritySettings(companyId) {
    const doc = await ExtractorSettings.findOne({ companyId }).lean();
    return normalizeSimilaritySettings(doc?.aiLeadIntelligence?.similarCompany || {});
}

export async function saveSimilaritySettings(companyId, userId, payload = {}) {
    const normalized = normalizeSimilaritySettings(payload);
    const existing = await ExtractorSettings.findOne({ companyId });
    if (!existing) {
        await ExtractorSettings.create({
            companyId,
            aiLeadIntelligence: { similarCompany: normalized },
            updatedBy: userId || null,
        });
        return normalized;
    }
    const ali = { ...(existing.aiLeadIntelligence?.toObject?.() || existing.aiLeadIntelligence || {}) };
    ali.similarCompany = normalized;
    existing.aiLeadIntelligence = ali;
    existing.updatedBy = userId || null;
    await existing.save();
    return normalized;
}

export function settingsFingerprint(settings) {
    return `${settings.version || SETTINGS_VERSION}:${ENGINE_VERSION}:${(settings.dimensions || [])
        .filter((d) => d.active !== false)
        .map((d) => `${d.id}:${d.weight}:${d.maxScore}`)
        .join('|')}`;
}
