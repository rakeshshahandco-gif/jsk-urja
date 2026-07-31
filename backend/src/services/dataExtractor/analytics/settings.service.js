import { ExtractorSettings } from '../../../models/extractorSettings.model.js';
import { DEFAULT_SETTINGS, SETTINGS_VERSION, ENGINE_VERSION, DEFAULT_SCORE_BANDS } from './constants.js';

function clone(o) { return JSON.parse(JSON.stringify(o)); }

export function normalizeAnalyticsSettings(raw = {}) {
    const base = clone(DEFAULT_SETTINGS);
    const incoming = raw && typeof raw === 'object' ? raw : {};
    const scoreBands = Array.isArray(incoming.scoreBands) && incoming.scoreBands.length
        ? incoming.scoreBands.map((b) => ({
            id: String(b.id || '').trim(),
            label: String(b.label || b.id || '').trim(),
            min: Math.max(0, Number(b.min) || 0),
            max: Math.min(100, Number(b.max) || 0),
        })).filter((b) => b.id)
        : clone(DEFAULT_SCORE_BANDS);
    const visibleWidgets = Array.isArray(incoming.visibleWidgets) && incoming.visibleWidgets.length
        ? incoming.visibleWidgets.map((w) => String(w || '').trim()).filter(Boolean)
        : base.visibleWidgets;
    return {
        ...base,
        ...incoming,
        version: String(incoming.version || SETTINGS_VERSION),
        enabled: incoming.enabled !== false,
        defaultDateRange: String(incoming.defaultDateRange || base.defaultDateRange),
        defaultDashboard: String(incoming.defaultDashboard || base.defaultDashboard),
        visibleWidgets,
        scoreBands,
        staleBatchMinutes: Math.max(1, Number(incoming.staleBatchMinutes ?? base.staleBatchMinutes) || base.staleBatchMinutes),
        topNLimit: Math.max(1, Math.min(200, Number(incoming.topNLimit ?? base.topNLimit) || base.topNLimit)),
        refreshIntervalSeconds: Math.max(30, Number(incoming.refreshIntervalSeconds ?? base.refreshIntervalSeconds) || base.refreshIntervalSeconds),
        autoRefreshEnabled: incoming.autoRefreshEnabled === true,
        exportRowLimit: Math.max(1, Math.min(50000, Number(incoming.exportRowLimit ?? base.exportRowLimit) || base.exportRowLimit)),
        allowCompanySavedViews: incoming.allowCompanySavedViews !== false,
        timezone: String(incoming.timezone || base.timezone || 'Asia/Kolkata'),
    };
}

export async function getAnalyticsSettings(companyId) {
    const doc = await ExtractorSettings.findOne({ companyId }).lean();
    return normalizeAnalyticsSettings(doc?.aiLeadIntelligence?.analytics || {});
}

export async function saveAnalyticsSettings(companyId, userId, payload = {}) {
    const normalized = normalizeAnalyticsSettings(payload);
    const existing = await ExtractorSettings.findOne({ companyId });
    if (!existing) {
        await ExtractorSettings.create({
            companyId,
            aiLeadIntelligence: { analytics: normalized },
            updatedBy: userId || null,
        });
        return normalized;
    }
    const ali = { ...(existing.aiLeadIntelligence?.toObject?.() || existing.aiLeadIntelligence || {}) };
    ali.analytics = normalized;
    existing.aiLeadIntelligence = ali;
    existing.updatedBy = userId || null;
    await existing.save();
    return normalized;
}

export function settingsFingerprint(settings) {
    return `${settings.version || SETTINGS_VERSION}:${ENGINE_VERSION}:${settings.defaultDateRange}:${settings.topNLimit}:${settings.staleBatchMinutes}`;
}