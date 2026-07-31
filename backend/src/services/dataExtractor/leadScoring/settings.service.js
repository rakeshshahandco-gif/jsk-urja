import { ExtractorSettings } from '../../../models/extractorSettings.model.js';
import { DEFAULT_SCORING_SETTINGS, SETTINGS_VERSION, ENGINE_VERSION } from './constants.js';

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

export function normalizeScoringSettings(raw = {}) {
    const base = clone(DEFAULT_SCORING_SETTINGS);
    const incoming = raw && typeof raw === 'object' ? raw : {};
    const merged = {
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
        priorityThresholds: Array.isArray(incoming.priorityThresholds) && incoming.priorityThresholds.length
            ? incoming.priorityThresholds
            : base.priorityThresholds,
        gradeThresholds: Array.isArray(incoming.gradeThresholds) && incoming.gradeThresholds.length
            ? incoming.gradeThresholds
            : base.gradeThresholds,
        maxAiAdjustment: Math.max(0, Math.min(20, Number(incoming.maxAiAdjustment ?? base.maxAiAdjustment) || 5)),
    };
    return merged;
}

export async function getLeadScoringSettings(companyId) {
    const doc = await ExtractorSettings.findOne({ companyId }).lean();
    const raw = doc?.aiLeadIntelligence?.leadScoring || {};
    return normalizeScoringSettings(raw);
}

export async function saveLeadScoringSettings(companyId, userId, payload = {}) {
    const normalized = normalizeScoringSettings(payload);
    const existing = await ExtractorSettings.findOne({ companyId });
    if (!existing) {
        const created = await ExtractorSettings.create({
            companyId,
            aiLeadIntelligence: { leadScoring: normalized },
            updatedBy: userId || null,
        });
        return normalizeScoringSettings(created.aiLeadIntelligence?.leadScoring);
    }
    const ali = { ...(existing.aiLeadIntelligence?.toObject?.() || existing.aiLeadIntelligence || {}) };
    ali.leadScoring = normalized;
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
